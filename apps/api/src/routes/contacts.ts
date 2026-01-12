import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';
import {
    createContactSchema,
    updateContactSchema,
    importContactsSchema,
    contactsQuerySchema,
    phoneE164Schema
} from '@sms/shared';

export async function contactRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /contacts - List contacts with filtering
     */
    fastify.get('/', {
        preHandler: [requirePermission('contacts:read')]
    }, async (request: FastifyRequest) => {
        const { page, limit, search, tags, optedOut } = contactsQuerySchema.parse(request.query);
        const offset = (page - 1) * limit;

        let whereClause = 'tenant_id = $1';
        const values: unknown[] = [request.tenantId];
        let paramIndex = 2;

        if (search) {
            whereClause += ` AND (phone_e164 ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`;
            values.push(`%${search}%`);
            paramIndex++;
        }

        if (tags && tags.length > 0) {
            whereClause += ` AND tags && $${paramIndex}`;
            values.push(tags);
            paramIndex++;
        }

        if (optedOut !== undefined) {
            whereClause += ` AND opted_out = $${paramIndex}`;
            values.push(optedOut);
            paramIndex++;
        }

        const [countResult, dataResult] = await Promise.all([
            fastify.db.query(
                `SELECT COUNT(*) FROM contacts WHERE ${whereClause}`,
                values
            ),
            fastify.db.query(
                `SELECT id, phone_e164, name, tags, custom_fields, opted_out, opted_out_at, created_at
         FROM contacts WHERE ${whereClause}
         ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
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
     * GET /contacts/:id - Get contact by ID
     */
    fastify.get('/:id', {
        preHandler: [requirePermission('contacts:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `SELECT id, phone_e164, name, tags, custom_fields, opted_out, opted_out_at, created_at, updated_at
       FROM contacts WHERE id = $1 AND tenant_id = $2`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Contact not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /contacts - Create contact
     */
    fastify.post('/', {
        preHandler: [requirePermission('contacts:write')]
    }, async (request: FastifyRequest, reply) => {
        const body = createContactSchema.parse(request.body);

        // Check for duplicate
        const existing = await fastify.db.query(
            'SELECT id FROM contacts WHERE phone_e164 = $1 AND tenant_id = $2',
            [body.phoneE164, request.tenantId]
        );

        if (existing.rows.length > 0) {
            return reply.status(409).send({
                success: false,
                error: 'Contact with this phone number already exists'
            });
        }

        const result = await fastify.db.query(
            `INSERT INTO contacts (tenant_id, phone_e164, name, tags, custom_fields)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, phone_e164, name, tags, custom_fields, opted_out, created_at`,
            [request.tenantId, body.phoneE164, body.name || null, body.tags, body.customFields || {}]
        );

        return { success: true, data: result.rows[0] };
    });

    /**
     * PATCH /contacts/:id - Update contact
     */
    fastify.patch('/:id', {
        preHandler: [requirePermission('contacts:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;
        const body = updateContactSchema.parse(request.body);

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (body.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(body.name);
        }
        if (body.tags) {
            updates.push(`tags = $${paramIndex++}`);
            values.push(body.tags);
        }
        if (body.customFields) {
            updates.push(`custom_fields = $${paramIndex++}`);
            values.push(JSON.stringify(body.customFields));
        }

        if (updates.length === 0) {
            return { success: true, message: 'No updates provided' };
        }

        values.push(id, request.tenantId);

        const result = await fastify.db.query(
            `UPDATE contacts SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
       RETURNING id, phone_e164, name, tags, custom_fields, opted_out, updated_at`,
            values
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Contact not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * DELETE /contacts/:id - Delete contact
     */
    fastify.delete('/:id', {
        preHandler: [requirePermission('contacts:delete')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            'DELETE FROM contacts WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Contact not found' });
        }

        return { success: true, message: 'Contact deleted' };
    });

    /**
     * POST /contacts/import - Import contacts from CSV data
     */
    fastify.post('/import', {
        preHandler: [requirePermission('contacts:import')]
    }, async (request: FastifyRequest) => {
        const body = importContactsSchema.parse(request.body);

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as { phone: string; error: string }[]
        };

        for (const contact of body.contacts) {
            try {
                // Normalize phone to E.164
                let phone = contact.phone.replace(/\D/g, '');
                if (!phone.startsWith('+')) {
                    phone = '+' + phone;
                }

                // Validate E.164
                const parseResult = phoneE164Schema.safeParse(phone);
                if (!parseResult.success) {
                    if (body.skipInvalid) {
                        results.skipped++;
                        results.errors.push({ phone: contact.phone, error: 'Invalid E.164 format' });
                        continue;
                    } else {
                        throw new Error('Invalid E.164 format');
                    }
                }

                const tags = [...(contact.tags || []), ...(body.defaultTags || [])];

                // Upsert contact
                await fastify.db.query(
                    `INSERT INTO contacts (tenant_id, phone_e164, name, tags)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, phone_e164) 
           DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name),
                         tags = array_cat(contacts.tags, EXCLUDED.tags)`,
                    [request.tenantId, phone, contact.name || null, tags]
                );

                results.imported++;
            } catch (err) {
                results.skipped++;
                results.errors.push({
                    phone: contact.phone,
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, details)
       VALUES ($1, $2, $3, $4, $5)`,
            [request.tenantId, request.user!.sub, 'import', 'contact', JSON.stringify(results)]
        );

        return { success: true, data: results };
    });

    /**
     * POST /contacts/:id/opt-out - Opt out a contact
     */
    fastify.post('/:id/opt-out', {
        preHandler: [requirePermission('contacts:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `UPDATE contacts SET opted_out = TRUE, opted_out_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, phone_e164, opted_out, opted_out_at`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Contact not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /contacts/:id/opt-in - Re-opt in a contact
     */
    fastify.post('/:id/opt-in', {
        preHandler: [requirePermission('contacts:write')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `UPDATE contacts SET opted_out = FALSE, opted_out_at = NULL
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, phone_e164, opted_out`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Contact not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /contacts/sync-from-phone - Sync contacts from connected phone
     * This will scrape contacts from Google Messages and import them
     */
    fastify.post('/sync-from-phone', {
        preHandler: [requirePermission('contacts:import')]
    }, async (request: FastifyRequest, reply) => {
        // Check if session is connected
        const session = await fastify.db.query(
            `SELECT status FROM sessions WHERE tenant_id = $1`,
            [request.tenantId]
        );

        if (session.rows.length === 0 || session.rows[0].status !== 'connected') {
            return reply.status(400).send({
                success: false,
                error: 'Session not connected. Please connect to Google Messages first.'
            });
        }

        // Enqueue sync job
        const jobId = await fastify.queue.send('sync-contacts', {
            tenantId: request.tenantId,
            maxContacts: 500
        });

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, details)
       VALUES ($1, $2, $3, $4, $5)`,
            [request.tenantId, request.user!.sub, 'sync_from_phone', 'contact', JSON.stringify({ jobId })]
        );

        return {
            success: true,
            message: 'Contact sync started. This may take a few minutes.',
            data: { jobId }
        };
    });
}

