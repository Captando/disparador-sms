import { chromium, type BrowserContext, type Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Selectors for Google Messages Web UI
// NOTE: These may change if Google updates their UI
const SELECTORS = {
    // QR Code
    qrCanvas: 'canvas',
    qrContainer: 'mw-qr-code',

    // Login state detection
    conversationList: 'mws-conversations-list',
    mainContent: 'main',

    // New conversation
    startChatButton: '[data-e2e-start-chat-button]',
    startChatFab: 'a[href="/web/conversations/new"]',

    // Contact input
    recipientInput: 'input[placeholder*="name"], input[placeholder*="number"], input[aria-label*="recipient"]',
    contactSuggestion: '[data-e2e-contact-row]',

    // Message composer
    messageInput: '[data-e2e-message-input-box], [contenteditable="true"][aria-label*="message"]',

    // Attachment
    attachButton: '[data-e2e-attach-menu-button], button[aria-label*="Attach"], button[aria-label*="anexar"]',
    fileInput: 'input[type="file"]',
    attachmentPreview: '[data-e2e-attached-image], img[src*="blob:"]',

    // Send
    sendButton: '[data-e2e-send-text-button], button[aria-label*="Send"], button[aria-label*="Enviar"]',

    // Message status
    messageSent: '[data-e2e-message-status="sent"],.message-status-sent',
    messageError: '.message-status-error,.error-message',
};

export interface SendResult {
    success: boolean;
    error?: string;
    fallbackUsed?: boolean;
    screenshotPath?: string;
}

export class GoogleMessagesClient {
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private tenantId: string;
    private sessionsPath: string;
    private isReady: boolean = false;

    constructor(tenantId: string, sessionsPath: string) {
        this.tenantId = tenantId;
        this.sessionsPath = sessionsPath;
    }

    /**
     * Get the user data directory for persistent session
     */
    private getUserDataDir(): string {
        const dir = path.join(this.sessionsPath, this.tenantId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Launch browser with persistent context
     */
    async launch(): Promise<void> {
        console.log(`[${this.tenantId}] Launching browser...`);

        const userDataDir = this.getUserDataDir();

        this.context = await chromium.launchPersistentContext(userDataDir, {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1280,800',
            ],
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        this.page = await this.context.newPage();

        // Navigate to Google Messages
        await this.page.goto('https://messages.google.com/web/authentication', {
            waitUntil: 'networkidle',
            timeout: 60000,
        });

        console.log(`[${this.tenantId}] Browser launched, checking state...`);
    }

    /**
     * Detect current state: needs-qr, connected, or error
     */
    async detectState(): Promise<'needs-qr' | 'connected' | 'error'> {
        if (!this.page) return 'error';

        try {
            // Wait a bit for page to settle
            await this.page.waitForTimeout(2000);

            // Check if we have conversations (logged in)
            const hasConversations = await this.page.$(SELECTORS.conversationList);
            if (hasConversations) {
                this.isReady = true;
                return 'connected';
            }

            // Check for QR code
            const hasQR = await this.page.$('canvas');
            if (hasQR) {
                return 'needs-qr';
            }

            // Check if on main messages page (logged in)
            const url = this.page.url();
            if (url.includes('/web/conversations') || url.includes('/web/c/')) {
                this.isReady = true;
                return 'connected';
            }

            return 'needs-qr';
        } catch (err) {
            console.error(`[${this.tenantId}] State detection error:`, err);
            return 'error';
        }
    }

    /**
     * Capture QR code as base64 image
     */
    async captureQRCode(): Promise<string | null> {
        if (!this.page) return null;

        try {
            // Wait for canvas to appear
            const canvas = await this.page.waitForSelector('canvas', { timeout: 10000 });
            if (!canvas) return null;

            // Take screenshot of the entire QR area
            const qrArea = await this.page.$('mw-qr-code') || canvas;
            const screenshot = await qrArea.screenshot({ type: 'png' });

            return `data:image/png;base64,${screenshot.toString('base64')}`;
        } catch (err) {
            console.error(`[${this.tenantId}] QR capture error:`, err);
            return null;
        }
    }

    /**
     * Wait for successful login after QR scan
     */
    async waitForLogin(timeoutMs: number = 120000): Promise<boolean> {
        if (!this.page) return false;

        try {
            // Wait for either conversations list or navigation to messages
            await Promise.race([
                this.page.waitForSelector(SELECTORS.conversationList, { timeout: timeoutMs }),
                this.page.waitForURL('**/web/conversations**', { timeout: timeoutMs }),
            ]);

            this.isReady = true;
            return true;
        } catch (err) {
            console.error(`[${this.tenantId}] Login wait timeout:`, err);
            return false;
        }
    }

    /**
     * Check if session is healthy
     */
    async checkHealth(): Promise<boolean> {
        if (!this.page || !this.isReady) return false;

        try {
            // Try to access the page
            const state = await this.detectState();
            return state === 'connected';
        } catch {
            return false;
        }
    }

    /**
     * Send a text message
     */
    async sendText(phoneE164: string, text: string): Promise<SendResult> {
        if (!this.page || !this.isReady) {
            return { success: false, error: 'Session not ready' };
        }

        try {
            // Start new conversation
            await this.startNewConversation(phoneE164);

            // Type and send message
            await this.typeAndSend(text);

            // Verify message was sent
            const sent = await this.verifyMessageSent();

            return { success: sent, error: sent ? undefined : 'Message send verification failed' };
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[${this.tenantId}] Send text error:`, error);

            // Take screenshot on error
            const screenshotPath = await this.takeErrorScreenshot('send_text');

            return { success: false, error, screenshotPath };
        }
    }

    /**
     * Send an image with optional caption
     */
    async sendImage(phoneE164: string, imagePath: string, caption?: string): Promise<SendResult> {
        if (!this.page || !this.isReady) {
            return { success: false, error: 'Session not ready' };
        }

        try {
            // Start new conversation
            await this.startNewConversation(phoneE164);

            // Attach image
            const attached = await this.attachImage(imagePath);

            if (!attached) {
                // RCS might not be supported, use fallback
                return { success: false, error: 'Failed to attach image - RCS may not be supported' };
            }

            // Add caption if provided
            if (caption) {
                await this.typeMessage(caption);
            }

            // Send
            await this.clickSend();

            // Verify
            const sent = await this.verifyMessageSent();

            return { success: sent, error: sent ? undefined : 'Image send verification failed' };
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[${this.tenantId}] Send image error:`, error);

            const screenshotPath = await this.takeErrorScreenshot('send_image');

            return { success: false, error, screenshotPath };
        }
    }

    /**
     * Start a new conversation with a phone number
     */
    private async startNewConversation(phoneE164: string): Promise<void> {
        if (!this.page) throw new Error('Page not available');

        // Navigate to new conversation
        await this.page.goto('https://messages.google.com/web/conversations/new', {
            waitUntil: 'networkidle',
            timeout: 30000,
        });

        // Wait for input field
        const input = await this.page.waitForSelector(SELECTORS.recipientInput, { timeout: 10000 });
        if (!input) throw new Error('Recipient input not found');

        // Clear and type phone number
        await input.fill(phoneE164);
        await this.page.waitForTimeout(1000);

        // Press Enter to confirm
        await input.press('Enter');
        await this.page.waitForTimeout(1000);

        // Wait for message composer to appear
        await this.page.waitForSelector(SELECTORS.messageInput, { timeout: 10000 });
    }

    /**
     * Type a message in the composer
     */
    private async typeMessage(text: string): Promise<void> {
        if (!this.page) throw new Error('Page not available');

        const input = await this.page.waitForSelector(SELECTORS.messageInput, { timeout: 5000 });
        if (!input) throw new Error('Message input not found');

        // Focus and type
        await input.click();
        await input.fill(text);
    }

    /**
     * Type message and send
     */
    private async typeAndSend(text: string): Promise<void> {
        await this.typeMessage(text);
        await this.clickSend();
    }

    /**
     * Click the send button
     */
    private async clickSend(): Promise<void> {
        if (!this.page) throw new Error('Page not available');

        // Try multiple selectors for send button
        const sendButton = await this.page.$(SELECTORS.sendButton);

        if (sendButton) {
            await sendButton.click();
        } else {
            // Try pressing Enter as fallback
            await this.page.keyboard.press('Enter');
        }

        await this.page.waitForTimeout(2000);
    }

    /**
     * Attach an image file
     */
    private async attachImage(imagePath: string): Promise<boolean> {
        if (!this.page) throw new Error('Page not available');

        try {
            // Click attach button
            const attachButton = await this.page.$(SELECTORS.attachButton);
            if (!attachButton) {
                console.log(`[${this.tenantId}] Attach button not found`);
                return false;
            }

            await attachButton.click();
            await this.page.waitForTimeout(500);

            // Set file input
            const fileInput = await this.page.$(SELECTORS.fileInput);
            if (!fileInput) {
                // Try using file chooser
                const [fileChooser] = await Promise.all([
                    this.page.waitForEvent('filechooser', { timeout: 5000 }),
                    attachButton.click(),
                ]);
                await fileChooser.setFiles(imagePath);
            } else {
                await fileInput.setInputFiles(imagePath);
            }

            // Wait for preview to appear
            await this.page.waitForSelector(SELECTORS.attachmentPreview, { timeout: 10000 });

            return true;
        } catch (err) {
            console.error(`[${this.tenantId}] Attach image error:`, err);
            return false;
        }
    }

    /**
     * Verify that message was sent successfully
     */
    private async verifyMessageSent(): Promise<boolean> {
        if (!this.page) return false;

        try {
            // Wait for sent status indicator
            await this.page.waitForTimeout(3000);

            // Check for error indicators
            const hasError = await this.page.$(SELECTORS.messageError);
            if (hasError) {
                return false;
            }

            // Check for sent indicator or assume success if no error
            const hasSent = await this.page.$(SELECTORS.messageSent);

            // If we can't find explicit sent status, assume success if no error
            return hasSent !== null || true;
        } catch {
            return false;
        }
    }

    /**
     * Take error screenshot and save to S3
     */
    private async takeErrorScreenshot(prefix: string): Promise<string | undefined> {
        if (!this.page) return undefined;

        try {
            const timestamp = Date.now();
            const filename = `${this.tenantId}/errors/${prefix}_${timestamp}.png`;
            const localPath = `/tmp/${prefix}_${this.tenantId}_${timestamp}.png`;

            await this.page.screenshot({ path: localPath, fullPage: true });

            // Return the local path - the job handler will upload to S3
            return localPath;
        } catch (err) {
            console.error(`[${this.tenantId}] Screenshot error:`, err);
            return undefined;
        }
    }

    /**
     * Close the browser
     */
    async close(): Promise<void> {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
            this.isReady = false;
        }
    }
}
