import type { FastifyInstance, FastifyRequest } from 'fastify';
import * as argon2 from 'argon2';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';
import { createUserSchema, updateUserSchema, changePasswordSchema, paginationSchema } from '@sms/shared';

export async function userRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /users - List users in tenant
     */
    fastify.get('/', {
        preHandler: [requirePermission('users:read')]
    }, async (request: FastifyRequest) => {
        const { page, limit } = paginationSchema.parse(request.query);
        const offset = (page - 1) * limit;

        const [countResult, dataResult] = await Promise.all([
            fastify.db.query(
                'SELECT COUNT(*) FROM users WHERE tenant_id = $1',
                [request.tenantId]
            ),
            fastify.db.query(
                `SELECT id, email, name, role, is_active, last_login_at, created_at
         FROM users WHERE tenant_id = $1 
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
                [request.tenantId, limit, offset]
            )
        ]);

        const total = parseInt(countResult.rows[0].count);

        return {
            success: true,
            data: dataResult.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    });

    /**
     * GET /users/:id - Get user by ID
     */
    fastify.get('/:id', {
        preHandler: [requirePermission('users:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `SELECT id, email, name, role, is_active, last_login_at, created_at
       FROM users WHERE id = $1 AND tenant_id = $2`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                error: 'User not found'
            });
        }

        return {
            success: true,
            data: result.rows[0]
        };
    });

    /**
     * POST /users - Create user
     */
    fastify.post('/', {
        preHandler: [requirePermission('users:write')]
    }, async (request: FastifyRequest, reply) => {
        const body = createUserSchema.parse(request.body);

        // Check if email exists in tenant
        const existing = await fastify.db.query(
            'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
            [body.email, request.tenantId]
        );

        if (existing.rows.length > 0) {
            return reply.status(409).send({
                success: false,
                error: 'Email already exists in this tenant'
            });
        }

        // Prevent creating owner role (only one owner allowed)
        if (body.role === 'owner') {
            return reply.status(403).send({
                success: false,
                error: 'Cannot create additional owner users'
            });
        }

        const passwordHash = await argon2.hash(body.password);

        const result = await fastify.db.query(
            `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, is_active, created_at`,
            [request.tenantId, body.email, passwordHash, body.name || null, body.role]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'create', 'user', result.rows[0].id,
            JSON.stringify({ email: body.email, role: body.role })]
        );

        return {
            success: true,
            data: result.rows[0]
        };
    });

    /**
     * PATCH /users/:id - Update user
     */
    fastify.patch('/:id', {
        preHandler: [requirePermission('users:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;
        const body = updateUserSchema.parse(request.body);

        // Check user exists in tenant
        const existing = await fastify.db.query(
            'SELECT id, role FROM users WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent modifying owner role
        if (existing.rows[0].role === 'owner' && body.role && body.role !== 'owner') {
            return reply.status(403).send({
                success: false,
                error: 'Cannot change owner role'
            });
        }

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (body.email) {
            updates.push(`email = $${paramIndex++}`);
            values.push(body.email);
        }
        if (body.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(body.name);
        }
        if (body.role) {
            updates.push(`role = $${paramIndex++}`);
            values.push(body.role);
        }
        if (body.isActive !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            values.push(body.isActive);
        }

        if (updates.length === 0) {
            return { success: true, message: 'No updates provided' };
        }

        values.push(id, request.tenantId);

        const result = await fastify.db.query(
            `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING id, email, name, role, is_active, created_at`,
            values
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'update', 'user', id, JSON.stringify(body)]
        );

        return {
            success: true,
            data: result.rows[0]
        };
    });

    /**
     * DELETE /users/:id - Delete user
     */
    fastify.delete('/:id', {
        preHandler: [requirePermission('users:delete')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        // Check user exists and is not owner
        const existing = await fastify.db.query(
            'SELECT id, role FROM users WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                success: false,
                error: 'User not found'
            });
        }

        if (existing.rows[0].role === 'owner') {
            return reply.status(403).send({
                success: false,
                error: 'Cannot delete owner user'
            });
        }

        await fastify.db.query(
            'DELETE FROM users WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5)`,
            [request.tenantId, request.user!.sub, 'delete', 'user', id]
        );

        return { success: true, message: 'User deleted' };
    });

    /**
     * POST /users/me/password - Change own password
     */
    fastify.post('/me/password', async (request: FastifyRequest, reply) => {
        const body = changePasswordSchema.parse(request.body);

        const result = await fastify.db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [request.user!.sub]
        );

        const validPassword = await argon2.verify(result.rows[0].password_hash, body.currentPassword);
        if (!validPassword) {
            return reply.status(401).send({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        const newHash = await argon2.hash(body.newPassword);

        await fastify.db.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newHash, request.user!.sub]
        );

        // Invalidate all refresh tokens
        await fastify.db.query(
            'DELETE FROM refresh_tokens WHERE user_id = $1',
            [request.user!.sub]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type)
       VALUES ($1, $2, $3, $4)`,
            [request.tenantId, request.user!.sub, 'password_change', 'user']
        );

        return { success: true, message: 'Password changed successfully' };
    });
}
