import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

import { dbPlugin } from './plugins/db.js';
import { queuePlugin } from './plugins/queue.js';
import { s3Plugin } from './plugins/s3.js';
import { authRoutes } from './routes/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { userRoutes } from './routes/users.js';
import { sessionRoutes } from './routes/sessions.js';
import { contactRoutes } from './routes/contacts.js';
import { mediaRoutes } from './routes/media.js';
import { campaignRoutes } from './routes/campaigns.js';
import { messageRoutes } from './routes/messages.js';

const server = Fastify({
    logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production' ? {
            target: 'pino-pretty',
            options: { colorize: true }
        } : undefined
    }
});

// Security
await server.register(helmet);
await server.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
});

// Rate limiting
await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000
});

// File uploads
await server.register(multipart, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    }
});

// JWT
await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    sign: {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    }
});

// Plugins
await server.register(dbPlugin);
await server.register(queuePlugin);
await server.register(s3Plugin);

// Health check
server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
await server.register(authRoutes, { prefix: '/auth' });
await server.register(tenantRoutes, { prefix: '/tenants' });
await server.register(userRoutes, { prefix: '/users' });
await server.register(sessionRoutes, { prefix: '/sessions' });
await server.register(contactRoutes, { prefix: '/contacts' });
await server.register(mediaRoutes, { prefix: '/media' });
await server.register(campaignRoutes, { prefix: '/campaigns' });
await server.register(messageRoutes, { prefix: '/messages' });

// Error handler
server.setErrorHandler((error, request, reply) => {
    server.log.error(error);

    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 ? 'Internal Server Error' : error.message;

    reply.status(statusCode).send({
        success: false,
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
});

// Start server
const start = async () => {
    try {
        const host = process.env.API_HOST || '0.0.0.0';
        const port = Number(process.env.API_PORT) || 3000;

        await server.listen({ host, port });
        server.log.info(`Server running at http://${host}:${port}`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();

export { server };
