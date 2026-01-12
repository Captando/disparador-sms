import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

declare module 'fastify' {
    interface FastifyInstance {
        s3: {
            client: S3Client;
            bucket: string;
            upload: (key: string, body: Buffer, contentType: string) => Promise<string>;
            delete: (key: string) => Promise<void>;
            getSignedUrl: (key: string, expiresIn?: number) => Promise<string>;
            getPublicUrl: (key: string) => string;
        };
    }
}

async function s3PluginCallback(fastify: FastifyInstance) {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET || 'sms-media';
    const publicUrl = process.env.S3_PUBLIC_URL || endpoint;

    const client = new S3Client({
        endpoint,
        region: process.env.S3_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || '',
            secretAccessKey: process.env.S3_SECRET_KEY || '',
        },
        forcePathStyle: true, // Required for MinIO
    });

    const s3 = {
        client,
        bucket,

        async upload(key: string, body: Buffer, contentType: string): Promise<string> {
            await client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
                ACL: 'public-read',
            }));
            return this.getPublicUrl(key);
        },

        async delete(key: string): Promise<void> {
            await client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            }));
        },

        async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });
            return getSignedUrl(client, command, { expiresIn });
        },

        getPublicUrl(key: string): string {
            return `${publicUrl}/${key}`;
        }
    };

    fastify.decorate('s3', s3);
    fastify.log.info('S3 client initialized');
}

export const s3Plugin = fp(s3PluginCallback, {
    name: 's3-plugin'
});
