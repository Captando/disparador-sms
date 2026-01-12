import type pg from 'pg';
import { GoogleMessagesClient } from '../drivers/google-messages.js';
import { updateSessionStatus } from '../index.js';

interface WorkerContext {
    db: pg.Pool;
    sessions: Map<string, GoogleMessagesClient>;
    config: {
        sessionsPath: string;
        apiBaseUrl: string;
        internalApiKey: string;
    };
}

interface SessionConnectJob {
    tenantId: string;
}

/**
 * Handle session connection request
 * Launches browser, detects state, captures QR if needed
 */
export async function handleSessionConnect(
    data: SessionConnectJob,
    ctx: WorkerContext
): Promise<void> {
    const { tenantId } = data;

    try {
        // Check if session already exists
        let client = ctx.sessions.get(tenantId);

        if (!client) {
            client = new GoogleMessagesClient(tenantId, ctx.config.sessionsPath);
            ctx.sessions.set(tenantId, client);
        }

        // Launch browser if not already running
        await client.launch();

        // Detect current state
        const state = await client.detectState();
        console.log(`[${tenantId}] Session state: ${state}`);

        if (state === 'connected') {
            // Already connected!
            await updateSessionStatus(tenantId, 'connected');

            // Update last seen
            await ctx.db.query(
                'UPDATE sessions SET last_seen_at = NOW() WHERE tenant_id = $1',
                [tenantId]
            );

            return;
        }

        if (state === 'needs-qr') {
            // Capture and send QR code
            const qrCode = await client.captureQRCode();

            if (qrCode) {
                await updateSessionStatus(tenantId, 'needs-qr', { qrCode });

                // Start polling for login
                pollForLogin(tenantId, client, ctx);
            } else {
                await updateSessionStatus(tenantId, 'error', {
                    errorMessage: 'Failed to capture QR code'
                });
            }

            return;
        }

        // Error state
        await updateSessionStatus(tenantId, 'error', {
            errorMessage: 'Unknown browser state'
        });

    } catch (err) {
        console.error(`[${tenantId}] Session connect error:`, err);

        await updateSessionStatus(tenantId, 'error', {
            errorMessage: err instanceof Error ? err.message : 'Unknown error'
        });

        // Clean up on error
        const client = ctx.sessions.get(tenantId);
        if (client) {
            await client.close();
            ctx.sessions.delete(tenantId);
        }
    }
}

/**
 * Poll for successful login after QR scan
 */
async function pollForLogin(
    tenantId: string,
    client: GoogleMessagesClient,
    ctx: WorkerContext
): Promise<void> {
    const maxWaitMs = 120000; // 2 minutes
    const pollIntervalMs = 3000; // 3 seconds
    const startTime = Date.now();

    const poll = async () => {
        // Check if we've exceeded timeout
        if (Date.now() - startTime > maxWaitMs) {
            console.log(`[${tenantId}] QR scan timeout`);
            await updateSessionStatus(tenantId, 'needs-qr', {
                errorMessage: 'QR scan timeout - please try again'
            });
            return;
        }

        try {
            const state = await client.detectState();

            if (state === 'connected') {
                console.log(`[${tenantId}] Login successful!`);
                await updateSessionStatus(tenantId, 'connected', { qrCode: null });

                await ctx.db.query(
                    'UPDATE sessions SET last_seen_at = NOW() WHERE tenant_id = $1',
                    [tenantId]
                );

                return;
            }

            if (state === 'needs-qr') {
                // Still waiting, refresh QR code
                const qrCode = await client.captureQRCode();
                if (qrCode) {
                    await updateSessionStatus(tenantId, 'needs-qr', { qrCode });
                }

                // Continue polling
                setTimeout(poll, pollIntervalMs);
                return;
            }

            // Error state
            await updateSessionStatus(tenantId, 'error', {
                errorMessage: 'Session entered error state'
            });

        } catch (err) {
            console.error(`[${tenantId}] Poll error:`, err);
            // Continue polling despite errors
            setTimeout(poll, pollIntervalMs);
        }
    };

    // Start polling
    poll();
}

/**
 * Handle session disconnect request
 */
export async function handleSessionDisconnect(
    data: SessionConnectJob,
    ctx: WorkerContext
): Promise<void> {
    const { tenantId } = data;

    try {
        const client = ctx.sessions.get(tenantId);

        if (client) {
            await client.close();
            ctx.sessions.delete(tenantId);
        }

        await updateSessionStatus(tenantId, 'disconnected');

        console.log(`[${tenantId}] Session disconnected`);

    } catch (err) {
        console.error(`[${tenantId}] Disconnect error:`, err);
    }
}
