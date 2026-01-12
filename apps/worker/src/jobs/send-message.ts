import type pg from 'pg';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import { GoogleMessagesClient } from '../drivers/google-messages.js';
import type { MessageJob, SendTextJob, SendImageJob } from '@sms/shared';

interface WorkerContext {
    db: pg.Pool;
    sessions: Map<string, GoogleMessagesClient>;
    config: {
        sessionsPath: string;
        apiBaseUrl: string;
        internalApiKey: string;
    };
}

/**
 * Handle message sending job
 */
export async function handleSendMessage(
    data: MessageJob,
    ctx: WorkerContext
): Promise<void> {
    const { messageId, tenantId } = data;

    try {
        // Update message status to sending
        await ctx.db.query(
            `UPDATE messages SET status = 'sending', attempts = attempts + 1 WHERE id = $1`,
            [messageId]
        );

        // Get or create session
        let client = ctx.sessions.get(tenantId);

        if (!client) {
            // Try to restore session
            client = new GoogleMessagesClient(tenantId, ctx.config.sessionsPath);
            await client.launch();

            const state = await client.detectState();
            if (state !== 'connected') {
                throw new Error('Session not connected - please scan QR code');
            }

            ctx.sessions.set(tenantId, client);
        }

        // Check session health
        const isHealthy = await client.checkHealth();
        if (!isHealthy) {
            // Mark session as needing reconnection
            await ctx.db.query(
                `UPDATE sessions SET status = 'needs-qr' WHERE tenant_id = $1`,
                [tenantId]
            );

            throw new Error('Session disconnected - needs QR scan');
        }

        // Send based on job type
        let result;

        if (data.type === 'send_text') {
            result = await sendTextMessage(data, client);
        } else if (data.type === 'send_image') {
            result = await sendImageMessage(data, client, ctx);
        } else {
            throw new Error(`Unknown job type`);
        }

        // Update message with result
        if (result.success) {
            await ctx.db.query(
                `UPDATE messages SET status = 'sent', sent_at = NOW(), fallback_used = $2 WHERE id = $1`,
                [messageId, result.fallbackUsed || false]
            );

            // Update campaign counters
            await ctx.db.query(
                `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = (
          SELECT campaign_id FROM messages WHERE id = $1
        )`,
                [messageId]
            );

        } else {
            // Check if we should retry
            const message = await ctx.db.query(
                'SELECT attempts, max_attempts FROM messages WHERE id = $1',
                [messageId]
            );

            const { attempts, max_attempts } = message.rows[0];

            if (attempts < max_attempts) {
                // Schedule retry
                const retryDelay = Math.pow(2, attempts) * 60; // Exponential backoff in seconds

                await ctx.db.query(
                    `UPDATE messages SET status = 'queued', next_retry_at = NOW() + INTERVAL '${retryDelay} seconds', error = $2, error_screenshot_path = $3 WHERE id = $1`,
                    [messageId, result.error, result.screenshotPath]
                );
            } else {
                // Max retries exceeded
                await ctx.db.query(
                    `UPDATE messages SET status = 'failed', error = $2, error_screenshot_path = $3 WHERE id = $1`,
                    [messageId, result.error, result.screenshotPath]
                );

                // Update campaign failed counter
                await ctx.db.query(
                    `UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = (
            SELECT campaign_id FROM messages WHERE id = $1
          )`,
                    [messageId]
                );
            }
        }

        // Check if campaign is complete
        await checkCampaignCompletion(ctx, messageId);

        // Add jitter delay between messages to avoid detection
        const jitterMs = Math.random() * 2000 + 1000; // 1-3 seconds
        await new Promise(resolve => setTimeout(resolve, jitterMs));

    } catch (err) {
        console.error(`[${messageId}] Send message error:`, err);

        const errorMessage = err instanceof Error ? err.message : 'Unknown error';

        await ctx.db.query(
            `UPDATE messages SET status = 'failed', error = $2 WHERE id = $1`,
            [messageId, errorMessage]
        );

        await ctx.db.query(
            `UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = (
        SELECT campaign_id FROM messages WHERE id = $1
      )`,
            [messageId]
        );

        throw err; // Let pg-boss handle retry
    }
}

/**
 * Send a text-only message
 */
async function sendTextMessage(
    data: SendTextJob,
    client: GoogleMessagesClient
): Promise<{ success: boolean; error?: string; screenshotPath?: string }> {
    return client.sendText(data.phoneE164, data.bodyText);
}

/**
 * Send an image message with fallback
 */
async function sendImageMessage(
    data: SendImageJob,
    client: GoogleMessagesClient,
    ctx: WorkerContext
): Promise<{ success: boolean; error?: string; screenshotPath?: string; fallbackUsed?: boolean }> {

    // Download image to temp file
    const tempPath = await downloadToTemp(data.mediaUrl, data.messageId);

    if (!tempPath) {
        console.log(`[${data.messageId}] Failed to download image, using fallback`);
        const result = await client.sendText(data.phoneE164, data.fallbackText);
        return { ...result, fallbackUsed: true };
    }

    try {
        // Try to send image
        const result = await client.sendImage(data.phoneE164, tempPath, data.bodyText || undefined);

        if (!result.success) {
            // Image failed, try fallback text
            console.log(`[${data.messageId}] Image send failed, using fallback: ${result.error}`);
            const fallbackResult = await client.sendText(data.phoneE164, data.fallbackText);
            return { ...fallbackResult, fallbackUsed: true };
        }

        return result;

    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempPath);
        } catch {
            // Ignore cleanup errors
        }
    }
}

/**
 * Download a file from URL to temp directory
 */
async function downloadToTemp(url: string, jobId: string): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const ext = path.extname(new URL(url).pathname) || '.jpg';
            const tempPath = `/tmp/${jobId}${ext}`;

            const file = fs.createWriteStream(tempPath);
            const protocol = url.startsWith('https') ? https : http;

            const request = protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    resolve(null);
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve(tempPath);
                });
            });

            request.on('error', (err) => {
                console.error('Download error:', err);
                fs.unlink(tempPath, () => { });
                resolve(null);
            });

            // Timeout after 30 seconds
            request.setTimeout(30000, () => {
                request.destroy();
                resolve(null);
            });

        } catch (err) {
            console.error('Download setup error:', err);
            resolve(null);
        }
    });
}

/**
 * Check if a campaign is complete and update status
 */
async function checkCampaignCompletion(ctx: WorkerContext, messageId: string): Promise<void> {
    const result = await ctx.db.query(`
    SELECT c.id, c.total_recipients, c.sent_count, c.failed_count
    FROM campaigns c
    JOIN messages m ON m.campaign_id = c.id
    WHERE m.id = $1 AND c.status = 'running'
  `, [messageId]);

    if (result.rows.length === 0) return;

    const campaign = result.rows[0];
    const completed = campaign.sent_count + campaign.failed_count;

    if (completed >= campaign.total_recipients) {
        await ctx.db.query(
            `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [campaign.id]
        );

        console.log(`Campaign ${campaign.id} completed: ${campaign.sent_count} sent, ${campaign.failed_count} failed`);
    }
}
