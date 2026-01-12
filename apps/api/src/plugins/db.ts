import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import pg from 'pg';

const { Pool } = pg;

declare module 'fastify' {
    interface FastifyInstance {
        db: pg.Pool;
    }
}

async function dbPluginCallback(fastify: FastifyInstance) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
        await pool.query('SELECT NOW()');
        fastify.log.info('Database connected successfully');
    } catch (err) {
        fastify.log.error('Database connection failed:', err);
        throw err;
    }

    fastify.decorate('db', pool);

    fastify.addHook('onClose', async () => {
        await pool.end();
    });
}

export const dbPlugin = fp(dbPluginCallback, {
    name: 'db-plugin'
});
