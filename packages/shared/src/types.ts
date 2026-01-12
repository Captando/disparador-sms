// ============================================
// BASE TYPES
// ============================================

export interface BaseEntity {
    id: string;
    createdAt: Date;
}

export interface TenantEntity extends BaseEntity {
    tenantId: string;
}

// ============================================
// TENANT
// ============================================

export interface Tenant extends BaseEntity {
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    updatedAt: Date;
}

// ============================================
// USER & AUTH
// ============================================

export type UserRole = 'owner' | 'admin' | 'operator' | 'viewer';

export interface User extends TenantEntity {
    email: string;
    name: string | null;
    role: UserRole;
    isActive: boolean;
    lastLoginAt: Date | null;
    updatedAt: Date;
}

export interface UserWithPassword extends User {
    passwordHash: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface JwtPayload {
    sub: string; // user id
    tenantId: string;
    role: UserRole;
    iat: number;
    exp: number;
}

// ============================================
// SESSION (Google Messages)
// ============================================

export type SessionStatus = 'connected' | 'disconnected' | 'needs-qr' | 'error';

export interface Session extends TenantEntity {
    status: SessionStatus;
    qrCode: string | null;
    lastSeenAt: Date | null;
    storagePath: string | null;
    errorMessage: string | null;
    updatedAt: Date;
}

// ============================================
// CONTACT
// ============================================

export interface Contact extends TenantEntity {
    phoneE164: string;
    name: string | null;
    tags: string[];
    customFields: Record<string, unknown>;
    optedOut: boolean;
    optedOutAt: Date | null;
    updatedAt: Date;
}

// ============================================
// MEDIA
// ============================================

export interface Media extends TenantEntity {
    filename: string;
    originalFilename: string;
    url: string;
    mime: string;
    sizeBytes: number;
    checksum: string | null;
    width: number | null;
    height: number | null;
}

// ============================================
// CAMPAIGN
// ============================================

export type CampaignType = 'text' | 'image';
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface Campaign extends TenantEntity {
    name: string;
    type: CampaignType;
    templateText: string | null;
    mediaId: string | null;

    // Targeting
    targetTags: string[];
    targetAll: boolean;

    // Scheduling
    scheduleAt: Date | null;
    windowStart: string | null; // TIME as string HH:MM
    windowEnd: string | null;
    timezone: string;

    // Throttling
    throttleMinDelayMs: number;
    throttleMaxDelayMs: number;
    maxPerMinute: number;

    // Status
    status: CampaignStatus;
    totalRecipients: number;
    sentCount: number;
    failedCount: number;

    startedAt: Date | null;
    completedAt: Date | null;
    updatedAt: Date;
}

// ============================================
// MESSAGE
// ============================================

export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'cancelled';

export interface Message extends TenantEntity {
    campaignId: string | null;
    contactId: string | null;
    phoneE164: string;

    bodyText: string | null;
    mediaUrl: string | null;
    fallbackUsed: boolean;

    status: MessageStatus;
    error: string | null;
    errorScreenshotPath: string | null;

    attempts: number;
    maxAttempts: number;
    nextRetryAt: Date | null;

    queuedAt: Date;
    sentAt: Date | null;
    deliveredAt: Date | null;
}

// ============================================
// AUDIT LOG
// ============================================

export interface AuditLog extends TenantEntity {
    userId: string | null;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    details: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
}

// ============================================
// JOB TYPES (for pg-boss)
// ============================================

export interface SendTextJob {
    type: 'send_text';
    messageId: string;
    tenantId: string;
    phoneE164: string;
    bodyText: string;
}

export interface SendImageJob {
    type: 'send_image';
    messageId: string;
    tenantId: string;
    phoneE164: string;
    mediaUrl: string;
    bodyText: string | null;
    fallbackText: string; // Text to send if image fails
}

export type MessageJob = SendTextJob | SendImageJob;

// ============================================
// API RESPONSES
// ============================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// ============================================
// PERMISSIONS
// ============================================

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
    owner: ['*'], // All permissions
    admin: [
        'users:read', 'users:write', 'users:delete',
        'contacts:read', 'contacts:write', 'contacts:delete', 'contacts:import',
        'campaigns:read', 'campaigns:write', 'campaigns:delete', 'campaigns:start',
        'media:read', 'media:write', 'media:delete',
        'sessions:read', 'sessions:write',
        'messages:read',
        'audit:read',
    ],
    operator: [
        'contacts:read', 'contacts:write', 'contacts:import',
        'campaigns:read', 'campaigns:write', 'campaigns:start',
        'media:read', 'media:write',
        'sessions:read',
        'messages:read',
    ],
    viewer: [
        'contacts:read',
        'campaigns:read',
        'media:read',
        'sessions:read',
        'messages:read',
    ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    if (permissions.includes('*')) return true;
    return permissions.includes(permission);
}
