import type pg from 'pg';
import { GoogleMessagesClient } from '../drivers/google-messages.js';

interface WorkerContext {
    db: pg.Pool;
    sessions: Map<string, GoogleMessagesClient>;
    config: {
        sessionsPath: string;
        apiBaseUrl: string;
        internalApiKey: string;
    };
}

interface SyncContactsJob {
    tenantId: string;
    maxContacts?: number;
}

/**
 * Handle contact sync from phone
 * Scrapes contacts from Google Messages and imports to database
 */
export async function handleSyncContacts(
    data: SyncContactsJob,
    ctx: WorkerContext
): Promise<{ imported: number; skipped: number }> {
    const { tenantId, maxContacts = 500 } = data;

    console.log(`[${tenantId}] Starting contact sync from phone...`);

    // Get or create session
    let client = ctx.sessions.get(tenantId);

    if (!client) {
        client = new GoogleMessagesClient(tenantId, ctx.config.sessionsPath);
        await client.launch();

        const state = await client.detectState();
        if (state !== 'connected') {
            throw new Error('Session not connected - please scan QR code first');
        }

        ctx.sessions.set(tenantId, client);
    }

    // Check session health
    const isHealthy = await client.checkHealth();
    if (!isHealthy) {
        throw new Error('Session disconnected - needs QR scan');
    }

    // Scrape contacts
    const scrapedContacts = await client.scrapeContacts(maxContacts);

    console.log(`[${tenantId}] Scraped ${scrapedContacts.length} contacts, importing...`);

    let imported = 0;
    let skipped = 0;

    for (const contact of scrapedContacts) {
        try {
            // Upsert contact (update if exists, insert if not)
            const result = await ctx.db.query(
                `INSERT INTO contacts (tenant_id, phone_e164, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, phone_e164) 
         DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name)
         RETURNING id, (xmax = 0) as is_new`,
                [tenantId, contact.phone, contact.name]
            );

            if (result.rows[0]?.is_new) {
                imported++;
            } else {
                skipped++; // Already existed
            }
        } catch (err) {
            console.error(`[${tenantId}] Failed to import contact ${contact.phone}:`, err);
            skipped++;
        }
    }

    console.log(`[${tenantId}] Contact sync complete: ${imported} imported, ${skipped} skipped/updated`);

    // Audit log
    await ctx.db.query(
        `INSERT INTO audit_logs (tenant_id, action, resource_type, details)
     VALUES ($1, $2, $3, $4)`,
        [tenantId, 'sync_contacts_from_phone', 'contact', JSON.stringify({
            scraped: scrapedContacts.length,
            imported,
            skipped
        })]
    );

    return { imported, skipped };
}
