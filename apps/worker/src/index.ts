import pg from 'pg';
import PgBoss from 'pg-boss';
import { GoogleMessagesClient } from './drivers/google-messages.js';
import { handleSendMessage } from './jobs/send-message.js';
import { handleSessionConnect, handleSessionDisconnect } from './jobs/session.js';
import type { MessageJob } from '@sms/shared';

const { Pool } = pg;

// Database pool
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
});

// Active browser sessions per tenant
const sessions = new Map<string, GoogleMessagesClient>();

// Configuration
const config = {
    sessionsPath: process.env.SESSIONS_PATH || '/data/sessions',
    maxConcurrentTenants: Number(process.env.WORKER_CONCURRENCY) || 2,
    apiBaseUrl: process.env.API_BASE_URL || 'http://api:3000',
    internalApiKey: process.env.INTERNAL_API_KEY || 'internal-key',
};

async function main() {
    console.log('🚀 Worker starting...');

    // Test database connection
    await db.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Initialize pg-boss
    const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL,
        retryLimit: 3,
        retryDelay: 60,
        retryBackoff: true,
    });

    boss.on('error', error => console.error('pg-boss error:', error));

    await boss.start();
    console.log('✅ pg-boss started');

    // Register job handlers

    // Session connection handler
    await boss.work('session-connect', { teamSize: 2 }, async (job) => {
        console.log(`📱 Processing session-connect for tenant ${job.data.tenantId}`);
        await handleSessionConnect(job.data, { db, sessions, config });
    });

    // Session disconnect handler
    await boss.work('session-disconnect', { teamSize: 2 }, async (job) => {
        console.log(`🔌 Processing session-disconnect for tenant ${job.data.tenantId}`);
        await handleSessionDisconnect(job.data, { db, sessions, config });
    });

    // Message sending handler
    await boss.work<MessageJob>('send-message', { teamSize: config.maxConcurrentTenants }, async (job) => {
        console.log(`📤 Processing send-message ${job.data.messageId}`);
        await handleSendMessage(job.data, { db, sessions, config });
    });

    // Health check - reconnect disconnected sessions periodically
    setInterval(async () => {
        try {
            const result = await db.query(
                "SELECT tenant_id FROM sessions WHERE status = 'connected' AND last_seen_at < NOW() - INTERVAL '5 minutes'"
            );

            for (const row of result.rows) {
                const client = sessions.get(row.tenant_id);
                if (client) {
                    const isHealthy = await client.checkHealth();
                    if (!isHealthy) {
                        console.log(`⚠️ Session for tenant ${row.tenant_id} unhealthy, marking as needs-qr`);
                        await updateSessionStatus(row.tenant_id, 'needs-qr');
                        await client.close();
                        sessions.delete(row.tenant_id);
                    }
                }
            }
        } catch (err) {
            console.error('Health check error:', err);
        }
    }, 60000); // Every minute

    console.log('✅ Worker ready and listening for jobs');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('🛑 Shutting down worker...');
        await boss.stop();

        for (const [tenantId, client] of sessions) {
            console.log(`Closing session for tenant ${tenantId}`);
            await client.close();
        }

        await db.end();
        process.exit(0);
    });
}

async function updateSessionStatus(tenantId: string, status: string, extra?: Record<string, unknown>) {
    const axios = (await import('axios')).default;

    await axios.post(`${config.apiBaseUrl}/sessions/internal/update`, {
        tenantId,
        status,
        ...extra
    }, {
        headers: {
            'X-Internal-Key': config.internalApiKey
        }
    });
}

main().catch(err => {
    console.error('Worker failed to start:', err);
    process.exit(1);
});

export { db, sessions, config, updateSessionStatus };
