import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';

// Store active SSE connections by tenant
const sseConnections = new Map<string, FastifyReply[]>();

export async function sessionRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /sessions - Get current session status
     */
    fastify.get('/', {
        preHandler: [requirePermission('sessions:read')]
    }, async (request: FastifyRequest) => {
        const result = await fastify.db.query(
            `SELECT id, status, last_seen_at, error_message, created_at, updated_at
       FROM sessions WHERE tenant_id = $1`,
            [request.tenantId]
        );

        return {
            success: true,
            data: result.rows[0] || null
        };
    });

    /**
     * POST /sessions/connect - Request to connect/reconnect session
     */
    fastify.post('/connect', {
        preHandler: [requirePermission('sessions:write')]
    }, async (request: FastifyRequest) => {
        // Update session status to needs-qr
        await fastify.db.query(
            `UPDATE sessions SET status = 'needs-qr', error_message = NULL, updated_at = NOW()
       WHERE tenant_id = $1`,
            [request.tenantId]
        );

        // Queue a job for the worker to initiate connection
        await fastify.queue.send('session-connect', {
            tenantId: request.tenantId
        });

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type)
       VALUES ($1, $2, $3, $4)`,
            [request.tenantId, request.user!.sub, 'session_connect_request', 'session']
        );

        return {
            success: true,
            message: 'Connection request sent. Watch for QR code.'
        };
    });

    /**
     * POST /sessions/disconnect - Disconnect session
     */
    fastify.post('/disconnect', {
        preHandler: [requirePermission('sessions:write')]
    }, async (request: FastifyRequest) => {
        await fastify.db.query(
            `UPDATE sessions SET status = 'disconnected', updated_at = NOW()
       WHERE tenant_id = $1`,
            [request.tenantId]
        );

        // Queue a job for the worker to close browser
        await fastify.queue.send('session-disconnect', {
            tenantId: request.tenantId
        });

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type)
       VALUES ($1, $2, $3, $4)`,
            [request.tenantId, request.user!.sub, 'session_disconnect', 'session']
        );

        return {
            success: true,
            message: 'Disconnect request sent'
        };
    });

    /**
     * GET /sessions/qr/stream - SSE stream for QR code updates
     */
    fastify.get('/qr/stream', {
        preHandler: [requirePermission('sessions:read')]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = request.tenantId!;

        // Set SSE headers
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        // Send initial connection event
        reply.raw.write(`event: connected\ndata: {"tenantId":"${tenantId}"}\n\n`);

        // Add to connections
        if (!sseConnections.has(tenantId)) {
            sseConnections.set(tenantId, []);
        }
        sseConnections.get(tenantId)!.push(reply);

        // Send current session status
        const result = await fastify.db.query(
            'SELECT status, qr_code FROM sessions WHERE tenant_id = $1',
            [tenantId]
        );

        if (result.rows[0]) {
            const { status, qr_code } = result.rows[0];
            reply.raw.write(`event: status\ndata: ${JSON.stringify({ status, qrCode: qr_code })}\n\n`);
        }

        // Keep-alive ping every 30 seconds
        const pingInterval = setInterval(() => {
            reply.raw.write(`: ping\n\n`);
        }, 30000);

        // Cleanup on close
        request.raw.on('close', () => {
            clearInterval(pingInterval);
            const connections = sseConnections.get(tenantId);
            if (connections) {
                const index = connections.indexOf(reply);
                if (index > -1) {
                    connections.splice(index, 1);
                }
                if (connections.length === 0) {
                    sseConnections.delete(tenantId);
                }
            }
        });

        // Don't close the response
        return reply;
    });

    /**
     * Internal endpoint for worker to update session status
     * POST /sessions/internal/update
     */
    fastify.post('/internal/update', async (request: FastifyRequest, reply: FastifyReply) => {
        // This should be called by the worker with internal auth
        const internalKey = request.headers['x-internal-key'];
        if (internalKey !== process.env.INTERNAL_API_KEY) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const body = request.body as {
            tenantId: string;
            status?: string;
            qrCode?: string | null;
            errorMessage?: string | null;
        };

        const updates: string[] = ['updated_at = NOW()'];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (body.status) {
            updates.push(`status = $${paramIndex++}`);
            values.push(body.status);
        }
        if (body.qrCode !== undefined) {
            updates.push(`qr_code = $${paramIndex++}`);
            values.push(body.qrCode);
        }
        if (body.errorMessage !== undefined) {
            updates.push(`error_message = $${paramIndex++}`);
            values.push(body.errorMessage);
        }
        if (body.status === 'connected') {
            updates.push(`last_seen_at = NOW()`);
        }

        values.push(body.tenantId);

        await fastify.db.query(
            `UPDATE sessions SET ${updates.join(', ')} WHERE tenant_id = $${paramIndex}`,
            values
        );

        // Broadcast to SSE connections
        const connections = sseConnections.get(body.tenantId);
        if (connections) {
            const eventData = JSON.stringify({
                status: body.status,
                qrCode: body.qrCode,
                errorMessage: body.errorMessage
            });

            for (const conn of connections) {
                conn.raw.write(`event: status\ndata: ${eventData}\n\n`);
            }
        }

        return { success: true };
    });
}
