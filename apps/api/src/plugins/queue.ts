import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import PgBoss from 'pg-boss';

declare module 'fastify' {
    interface FastifyInstance {
        queue: PgBoss;
    }
}

async function queuePluginCallback(fastify: FastifyInstance) {
    const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 60 * 60, // 1 hour
    });

    boss.on('error', error => fastify.log.error('pg-boss error:', error));

    await boss.start();
    fastify.log.info('pg-boss queue started');

    fastify.decorate('queue', boss);

    fastify.addHook('onClose', async () => {
        await boss.stop();
    });
}

export const queuePlugin = fp(queuePluginCallback, {
    name: 'queue-plugin'
});
