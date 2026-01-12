import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';
import { createCampaignSchema, updateCampaignSchema, campaignsQuerySchema } from '@sms/shared';

export async function campaignRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /campaigns - List campaigns
     */
    fastify.get('/', {
        preHandler: [requirePermission('campaigns:read')]
    }, async (request: FastifyRequest) => {
        const { page, limit, status, type } = campaignsQuerySchema.parse(request.query);
        const offset = (page - 1) * limit;

        let whereClause = 'c.tenant_id = $1';
        const values: unknown[] = [request.tenantId];
        let paramIndex = 2;

        if (status) {
            whereClause += ` AND c.status = $${paramIndex++}`;
            values.push(status);
        }
        if (type) {
            whereClause += ` AND c.type = $${paramIndex++}`;
            values.push(type);
        }

        const [countResult, dataResult] = await Promise.all([
            fastify.db.query(
                `SELECT COUNT(*) FROM campaigns c WHERE ${whereClause}`,
                values
            ),
            fastify.db.query(
                `SELECT c.id, c.name, c.type, c.template_text, c.media_id, 
                c.schedule_at, c.status, c.total_recipients, c.sent_count, c.failed_count,
                c.started_at, c.completed_at, c.created_at,
                m.url as media_url, m.original_filename as media_filename
         FROM campaigns c
         LEFT JOIN media m ON m.id = c.media_id
         WHERE ${whereClause}
         ORDER BY c.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
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
     * GET /campaigns/:id - Get campaign by ID
     */
    fastify.get('/:id', {
        preHandler: [requirePermission('campaigns:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `SELECT c.*, m.url as media_url, m.original_filename as media_filename
       FROM campaigns c
       LEFT JOIN media m ON m.id = c.media_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Campaign not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /campaigns - Create campaign
     */
    fastify.post('/', {
        preHandler: [requirePermission('campaigns:write')]
    }, async (request: FastifyRequest, reply) => {
        const body = createCampaignSchema.parse(request.body);

        // Validate media exists if type is image
        if (body.type === 'image' && !body.mediaId) {
            return reply.status(400).send({
                success: false,
                error: 'Media ID is required for image campaigns'
            });
        }

        if (body.mediaId) {
            const mediaCheck = await fastify.db.query(
                'SELECT id FROM media WHERE id = $1 AND tenant_id = $2',
                [body.mediaId, request.tenantId]
            );
            if (mediaCheck.rows.length === 0) {
                return reply.status(404).send({ success: false, error: 'Media not found' });
            }
        }

        const result = await fastify.db.query(
            `INSERT INTO campaigns (
        tenant_id, name, type, template_text, media_id,
        target_tags, target_all,
        schedule_at, window_start, window_end, timezone,
        throttle_min_delay_ms, throttle_max_delay_ms, max_per_minute
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
            [
                request.tenantId, body.name, body.type, body.templateText, body.mediaId || null,
                body.targetTags, body.targetAll,
                body.scheduleAt, body.windowStart, body.windowEnd, body.timezone,
                body.throttleMinDelayMs, body.throttleMaxDelayMs, body.maxPerMinute
            ]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'create', 'campaign', result.rows[0].id,
            JSON.stringify({ name: body.name, type: body.type })]
        );

        return { success: true, data: result.rows[0] };
    });

    /**
     * PATCH /campaigns/:id - Update campaign
     */
    fastify.patch('/:id', {
        preHandler: [requirePermission('campaigns:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;
        const body = updateCampaignSchema.parse(request.body);

        // Check campaign exists and is editable
        const existing = await fastify.db.query(
            'SELECT id, status FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (existing.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Campaign not found' });
        }

        if (['running', 'completed'].includes(existing.rows[0].status)) {
            return reply.status(409).send({
                success: false,
                error: 'Cannot edit running or completed campaigns'
            });
        }

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        const fieldMap: Record<string, string> = {
            name: 'name',
            type: 'type',
            templateText: 'template_text',
            mediaId: 'media_id',
            targetTags: 'target_tags',
            targetAll: 'target_all',
            scheduleAt: 'schedule_at',
            windowStart: 'window_start',
            windowEnd: 'window_end',
            timezone: 'timezone',
            throttleMinDelayMs: 'throttle_min_delay_ms',
            throttleMaxDelayMs: 'throttle_max_delay_ms',
            maxPerMinute: 'max_per_minute',
            status: 'status'
        };

        for (const [key, column] of Object.entries(fieldMap)) {
            if ((body as Record<string, unknown>)[key] !== undefined) {
                updates.push(`${column} = $${paramIndex++}`);
                values.push((body as Record<string, unknown>)[key]);
            }
        }

        if (updates.length === 0) {
            return { success: true, message: 'No updates provided' };
        }

        values.push(id, request.tenantId);

        const result = await fastify.db.query(
            `UPDATE campaigns SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING *`,
            values
        );

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /campaigns/:id/start - Start campaign
     */
    fastify.post('/:id/start', {
        preHandler: [requirePermission('campaigns:start')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const campaign = await fastify.db.query(
            `SELECT c.*, m.url as media_url 
       FROM campaigns c 
       LEFT JOIN media m ON m.id = c.media_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
            [id, request.tenantId]
        );

        if (campaign.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Campaign not found' });
        }

        const camp = campaign.rows[0];

        if (!['draft', 'scheduled', 'paused'].includes(camp.status)) {
            return reply.status(409).send({
                success: false,
                error: `Cannot start campaign with status '${camp.status}'`
            });
        }

        // Check session is connected
        const session = await fastify.db.query(
            'SELECT status FROM sessions WHERE tenant_id = $1',
            [request.tenantId]
        );

        if (session.rows.length === 0 || session.rows[0].status !== 'connected') {
            return reply.status(409).send({
                success: false,
                error: 'Google Messages session is not connected'
            });
        }

        // Get target contacts
        let contactsQuery = 'SELECT id, phone_e164, name, custom_fields FROM contacts WHERE tenant_id = $1 AND opted_out = FALSE';
        const contactValues: unknown[] = [request.tenantId];

        if (!camp.target_all && camp.target_tags.length > 0) {
            contactsQuery += ' AND tags && $2';
            contactValues.push(camp.target_tags);
        }

        const contacts = await fastify.db.query(contactsQuery, contactValues);

        if (contacts.rows.length === 0) {
            return reply.status(400).send({
                success: false,
                error: 'No contacts match the campaign criteria'
            });
        }

        // Update campaign status
        await fastify.db.query(
            `UPDATE campaigns SET status = 'running', started_at = NOW(), total_recipients = $1
       WHERE id = $2`,
            [contacts.rows.length, id]
        );

        // Create messages and queue jobs
        for (const contact of contacts.rows) {
            // Parse template with variables
            let bodyText = camp.template_text || '';
            bodyText = bodyText.replace(/\{nome\}/gi, contact.name || '');
            bodyText = bodyText.replace(/\{name\}/gi, contact.name || '');

            // Replace custom fields
            const customFields = contact.custom_fields || {};
            for (const [key, value] of Object.entries(customFields)) {
                bodyText = bodyText.replace(new RegExp(`\\{${key}\\}`, 'gi'), String(value));
            }

            // Create message record
            const message = await fastify.db.query(
                `INSERT INTO messages (tenant_id, campaign_id, contact_id, phone_e164, body_text, media_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
                [request.tenantId, id, contact.id, contact.phone_e164, bodyText, camp.media_url]
            );

            // Queue job
            const jobData = camp.type === 'image'
                ? {
                    type: 'send_image',
                    messageId: message.rows[0].id,
                    tenantId: request.tenantId,
                    phoneE164: contact.phone_e164,
                    mediaUrl: camp.media_url,
                    bodyText: bodyText || null,
                    fallbackText: `${bodyText || ''}\n\nVeja a imagem: ${camp.media_url}`.trim()
                }
                : {
                    type: 'send_text',
                    messageId: message.rows[0].id,
                    tenantId: request.tenantId,
                    phoneE164: contact.phone_e164,
                    bodyText
                };

            // Schedule with throttling
            const delay = Math.floor(
                Math.random() * (camp.throttle_max_delay_ms - camp.throttle_min_delay_ms) +
                camp.throttle_min_delay_ms
            );

            await fastify.queue.send('send-message', jobData, {
                startAfter: delay,
                retryLimit: 3,
                retryDelay: 60,
                retryBackoff: true
            });
        }

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'start', 'campaign', id,
            JSON.stringify({ recipients: contacts.rows.length })]
        );

        return {
            success: true,
            message: `Campaign started with ${contacts.rows.length} recipients`
        };
    });

    /**
     * POST /campaigns/:id/pause - Pause campaign
     */
    fastify.post('/:id/pause', {
        preHandler: [requirePermission('campaigns:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `UPDATE campaigns SET status = 'paused'
       WHERE id = $1 AND tenant_id = $2 AND status = 'running'
       RETURNING id`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Running campaign not found' });
        }

        // Cancel pending messages
        await fastify.db.query(
            `UPDATE messages SET status = 'cancelled'
       WHERE campaign_id = $1 AND status = 'queued'`,
            [id]
        );

        return { success: true, message: 'Campaign paused' };
    });

    /**
     * DELETE /campaigns/:id - Delete campaign
     */
    fastify.delete('/:id', {
        preHandler: [requirePermission('campaigns:delete')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const existing = await fastify.db.query(
            'SELECT id, status FROM campaigns WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (existing.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Campaign not found' });
        }

        if (existing.rows[0].status === 'running') {
            return reply.status(409).send({
                success: false,
                error: 'Cannot delete running campaign. Pause it first.'
            });
        }

        await fastify.db.query('DELETE FROM campaigns WHERE id = $1', [id]);

        return { success: true, message: 'Campaign deleted' };
    });
}
