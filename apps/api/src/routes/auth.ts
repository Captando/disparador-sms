import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { loginSchema, registerSchema, refreshTokenSchema } from '@sms/shared';

export async function authRoutes(fastify: FastifyInstance) {

    /**
     * POST /auth/register - Register new tenant with owner user
     */
    fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
        const body = registerSchema.parse(request.body);

        const client = await fastify.db.connect();
        try {
            await client.query('BEGIN');

            // Create slug from tenant name
            const slug = body.tenantName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

            // Check if slug exists
            const existingTenant = await client.query(
                'SELECT id FROM tenants WHERE slug = $1',
                [slug]
            );

            if (existingTenant.rows.length > 0) {
                return reply.status(409).send({
                    success: false,
                    error: 'Tenant with this name already exists'
                });
            }

            // Create tenant
            const tenantResult = await client.query(
                'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
                [body.tenantName, slug]
            );
            const tenantId = tenantResult.rows[0].id;

            // Hash password
            const passwordHash = await argon2.hash(body.password);

            // Create owner user
            const userResult = await client.query(
                `INSERT INTO users (tenant_id, email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
                [tenantId, body.email, passwordHash, body.name || null]
            );
            const userId = userResult.rows[0].id;

            // Create initial session record
            await client.query(
                'INSERT INTO sessions (tenant_id, status, storage_path) VALUES ($1, $2, $3)',
                [tenantId, 'disconnected', `/data/sessions/${tenantId}`]
            );

            await client.query('COMMIT');

            // Generate tokens
            const tokens = await generateTokens(fastify, userId, tenantId, 'owner');

            // Store refresh token
            await storeRefreshToken(fastify, userId, tokens.refreshToken);

            // Audit log
            await fastify.db.query(
                `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [tenantId, userId, 'register', 'user', userId, JSON.stringify({ email: body.email }), request.ip]
            );

            return {
                success: true,
                data: {
                    ...tokens,
                    user: {
                        id: userId,
                        email: body.email,
                        role: 'owner',
                        tenantId
                    }
                }
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    });

    /**
     * POST /auth/login - Login and get tokens
     */
    fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
        const { email, password } = loginSchema.parse(request.body);

        // Find user
        const result = await fastify.db.query(
            `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.is_active, u.name
       FROM users u WHERE u.email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return reply.status(401).send({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return reply.status(403).send({
                success: false,
                error: 'Account is disabled'
            });
        }

        // Verify password
        const validPassword = await argon2.verify(user.password_hash, password);
        if (!validPassword) {
            return reply.status(401).send({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Update last login
        await fastify.db.query(
            'UPDATE users SET last_login_at = NOW() WHERE id = $1',
            [user.id]
        );

        // Generate tokens
        const tokens = await generateTokens(fastify, user.id, user.tenant_id, user.role);

        // Store refresh token
        await storeRefreshToken(fastify, user.id, tokens.refreshToken);

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, details, ip_address) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [user.tenant_id, user.id, 'login', 'user', JSON.stringify({ email }), request.ip]
        );

        return {
            success: true,
            data: {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tenantId: user.tenant_id
                }
            }
        };
    });

    /**
     * POST /auth/refresh - Refresh access token
     */
    fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
        const { refreshToken } = refreshTokenSchema.parse(request.body);

        // Hash the refresh token to compare with stored hash
        const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

        // Find valid refresh token
        const result = await fastify.db.query(
            `SELECT rt.user_id, u.tenant_id, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            return reply.status(401).send({
                success: false,
                error: 'Invalid or expired refresh token'
            });
        }

        const { user_id, tenant_id, role, is_active } = result.rows[0];

        if (!is_active) {
            return reply.status(403).send({
                success: false,
                error: 'Account is disabled'
            });
        }

        // Delete old refresh token
        await fastify.db.query(
            'DELETE FROM refresh_tokens WHERE token_hash = $1',
            [tokenHash]
        );

        // Generate new tokens
        const tokens = await generateTokens(fastify, user_id, tenant_id, role);

        // Store new refresh token
        await storeRefreshToken(fastify, user_id, tokens.refreshToken);

        return {
            success: true,
            data: tokens
        };
    });

    /**
     * POST /auth/logout - Invalidate refresh token
     */
    fastify.post('/logout', {
        preHandler: [async (req, rep) => {
            try {
                await req.jwtVerify();
            } catch {
                // Allow logout even with invalid token
            }
        }]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { refreshToken?: string };

        if (body?.refreshToken) {
            const tokenHash = createHash('sha256').update(body.refreshToken).digest('hex');
            await fastify.db.query(
                'DELETE FROM refresh_tokens WHERE token_hash = $1',
                [tokenHash]
            );
        }

        return { success: true, message: 'Logged out successfully' };
    });
}

// Helper functions
async function generateTokens(
    fastify: FastifyInstance,
    userId: string,
    tenantId: string,
    role: string
) {
    const accessToken = fastify.jwt.sign({
        sub: userId,
        tenantId,
        role
    });

    const refreshToken = randomBytes(64).toString('hex');

    return {
        accessToken,
        refreshToken,
        expiresIn: 900 // 15 minutes in seconds
    };
}

async function storeRefreshToken(
    fastify: FastifyInstance,
    userId: string,
    refreshToken: string
) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await fastify.db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
    );
}
