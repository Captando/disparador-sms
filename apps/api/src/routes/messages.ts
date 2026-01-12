import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';
import { messagesQuerySchema } from '@sms/shared';

export async function messageRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /messages - List messages with filtering
     */
    fastify.get('/', {
        preHandler: [requirePermission('messages:read')]
    }, async (request: FastifyRequest) => {
        const { page, limit, campaignId, contactId, status, phoneE164 } = messagesQuerySchema.parse(request.query);
        const offset = (page - 1) * limit;

        let whereClause = 'm.tenant_id = $1';
        const values: unknown[] = [request.tenantId];
        let paramIndex = 2;

        if (campaignId) {
            whereClause += ` AND m.campaign_id = $${paramIndex++}`;
            values.push(campaignId);
        }
        if (contactId) {
            whereClause += ` AND m.contact_id = $${paramIndex++}`;
            values.push(contactId);
        }
        if (status) {
            whereClause += ` AND m.status = $${paramIndex++}`;
            values.push(status);
        }
        if (phoneE164) {
            whereClause += ` AND m.phone_e164 ILIKE $${paramIndex++}`;
            values.push(`%${phoneE164}%`);
        }

        const [countResult, dataResult] = await Promise.all([
            fastify.db.query(
                `SELECT COUNT(*) FROM messages m WHERE ${whereClause}`,
                values
            ),
            fastify.db.query(
                `SELECT m.id, m.phone_e164, m.body_text, m.media_url, m.fallback_used,
                m.status, m.error, m.attempts, m.queued_at, m.sent_at,
                c.name as campaign_name, ct.name as contact_name
         FROM messages m
         LEFT JOIN campaigns c ON c.id = m.campaign_id
         LEFT JOIN contacts ct ON ct.id = m.contact_id
         WHERE ${whereClause}
         ORDER BY m.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
                [...values, limit, offset]
            )
        ]);

        const total = parseInt(countResult.rows[0].count);

        return {
            success: true,
            data: dataResult.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    });

    /**
     * GET /messages/:id - Get message details
     */
    fastify.get('/:id', {
        preHandler: [requirePermission('messages:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `SELECT m.*, c.name as campaign_name, ct.name as contact_name
       FROM messages m
       LEFT JOIN campaigns c ON c.id = m.campaign_id
       LEFT JOIN contacts ct ON ct.id = m.contact_id
       WHERE m.id = $1 AND m.tenant_id = $2`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Message not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * GET /messages/stats - Get message statistics
     */
    fastify.get('/stats', {
        preHandler: [requirePermission('messages:read')]
    }, async (request: FastifyRequest) => {
        const query = request.query as { campaignId?: string };

        let whereClause = 'tenant_id = $1';
        const values: unknown[] = [request.tenantId];

        if (query.campaignId) {
            whereClause += ' AND campaign_id = $2';
            values.push(query.campaignId);
        }

        const result = await fastify.db.query(
            `SELECT 
        COUNT(*) FILTER (WHERE status = 'queued') as queued,
        COUNT(*) FILTER (WHERE status = 'sending') as sending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) as total
       FROM messages WHERE ${whereClause}`,
            values
        );

        return {
            success: true,
            data: result.rows[0]
        };
    });

    /**
     * GET /messages/:id/screenshot - Get error screenshot
     */
    fastify.get('/:id/screenshot', {
        preHandler: [requirePermission('messages:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            'SELECT error_screenshot_path FROM messages WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (result.rows.length === 0 || !result.rows[0].error_screenshot_path) {
            return reply.status(404).send({ success: false, error: 'Screenshot not found' });
        }

        // Return signed URL for screenshot
        const url = await fastify.s3.getSignedUrl(result.rows[0].error_screenshot_path, 300);

        return { success: true, data: { url } };
    });
}
