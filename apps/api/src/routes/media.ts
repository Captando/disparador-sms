import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware, requirePermission } from '../middlewares/auth.js';
import { paginationSchema } from '@sms/shared';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

export async function mediaRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    /**
     * GET /media - List media files
     */
    fastify.get('/', {
        preHandler: [requirePermission('media:read')]
    }, async (request: FastifyRequest) => {
        const { page, limit } = paginationSchema.parse(request.query);
        const offset = (page - 1) * limit;

        const [countResult, dataResult] = await Promise.all([
            fastify.db.query(
                'SELECT COUNT(*) FROM media WHERE tenant_id = $1',
                [request.tenantId]
            ),
            fastify.db.query(
                `SELECT id, filename, original_filename, url, mime, size_bytes, width, height, created_at
         FROM media WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
                [request.tenantId, limit, offset]
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
     * GET /media/:id - Get media by ID
     */
    fastify.get('/:id', {
        preHandler: [requirePermission('media:read')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        const result = await fastify.db.query(
            `SELECT id, filename, original_filename, url, mime, size_bytes, checksum, width, height, created_at
       FROM media WHERE id = $1 AND tenant_id = $2`,
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Media not found' });
        }

        return { success: true, data: result.rows[0] };
    });

    /**
     * POST /media/upload - Upload media file
     */
    fastify.post('/upload', {
        preHandler: [requirePermission('media:write')]
    }, async (request: FastifyRequest, reply) => {
        const data = await request.file();

        if (!data) {
            return reply.status(400).send({
                success: false,
                error: 'No file uploaded'
            });
        }

        // Validate mime type
        const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowedMimes.includes(data.mimetype)) {
            return reply.status(400).send({
                success: false,
                error: 'Invalid file type. Allowed: PNG, JPEG, WebP'
            });
        }

        // Read file buffer
        const buffer = await data.toBuffer();

        // Check file size (max 10MB)
        const maxSize = 10 * 1024 * 1024;
        if (buffer.length > maxSize) {
            return reply.status(400).send({
                success: false,
                error: 'File too large. Maximum size is 10MB'
            });
        }

        // Generate unique filename
        const ext = data.mimetype.split('/')[1];
        const filename = `${request.tenantId}/${randomUUID()}.${ext}`;
        const originalFilename = data.filename;

        // Calculate checksum
        const checksum = createHash('sha256').update(buffer).digest('hex');

        // Upload to S3
        const url = await fastify.s3.upload(filename, buffer, data.mimetype);

        // Get image dimensions (simplified - in production use sharp)
        let width: number | null = null;
        let height: number | null = null;

        // Store in database
        const result = await fastify.db.query(
            `INSERT INTO media (tenant_id, filename, original_filename, url, mime, size_bytes, checksum, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, filename, original_filename, url, mime, size_bytes, created_at`,
            [request.tenantId, filename, originalFilename, url, data.mimetype, buffer.length, checksum, width, height]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [request.tenantId, request.user!.sub, 'upload', 'media', result.rows[0].id,
            JSON.stringify({ filename: originalFilename, size: buffer.length })]
        );

        return { success: true, data: result.rows[0] };
    });

    /**
     * DELETE /media/:id - Delete media file
     */
    fastify.delete('/:id', {
        preHandler: [requirePermission('media:delete')]
    }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const { id } = request.params;

        // Get media to delete from S3
        const result = await fastify.db.query(
            'SELECT id, filename FROM media WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        if (result.rows.length === 0) {
            return reply.status(404).send({ success: false, error: 'Media not found' });
        }

        const media = result.rows[0];

        // Check if media is used in any campaign
        const usageCheck = await fastify.db.query(
            'SELECT id FROM campaigns WHERE media_id = $1 AND status IN ($2, $3)',
            [id, 'scheduled', 'running']
        );

        if (usageCheck.rows.length > 0) {
            return reply.status(409).send({
                success: false,
                error: 'Cannot delete media used in active campaigns'
            });
        }

        // Delete from S3
        await fastify.s3.delete(media.filename);

        // Delete from database
        await fastify.db.query(
            'DELETE FROM media WHERE id = $1 AND tenant_id = $2',
            [id, request.tenantId]
        );

        // Audit log
        await fastify.db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4, $5)`,
            [request.tenantId, request.user!.sub, 'delete', 'media', id]
        );

        return { success: true, message: 'Media deleted' };
    });
}
