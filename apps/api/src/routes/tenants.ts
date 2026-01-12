import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware, requireRole } from '../middlewares/auth.js';
import { createTenantSchema, updateTenantSchema } from '@sms/shared';

export async function tenantRoutes(fastify: FastifyInstance) {
    // All routes require authentication
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /tenants/me - Get current tenant
     */
    fastify.get('/me', async (request: FastifyRequest) => {
        const result = await fastify.db.query(
            'SELECT id, name, slug, settings, created_at, updated_at FROM tenants WHERE id = $1',
            [request.tenantId]
        );

        return {
            success: true,
            data: result.rows[0]
        };
    });

    /**
     * PATCH /tenants/me - Update current tenant
     */
    fastify.patch('/me', {
        preHandler: [requireRole('owner', 'admin')]
    }, async (request: FastifyRequest) => {
        const body = updateTenantSchema.parse(request.body);

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (body.name) {
            updates.push(`name = $${paramIndex++}`);
            values.push(body.name);
        }
        if (body.settings) {
            updates.push(`settings = $${paramIndex++}`);
            values.push(JSON.stringify(body.settings));
        }

        if (updates.length === 0) {
            return {
                success: true,
                message: 'No updates provided'
            };
        }

        values.push(request.tenantId);

        const result = await fastify.db.query(
            `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex} 
       RETURNING id, name, slug, settings, created_at, updated_at`,
            values
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'update', 'tenant', request.tenantId, JSON.stringify(body)]
        );

        return {
            success: true,
            data: result.rows[0]
        };
    });
}
