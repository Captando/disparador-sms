import { z } from 'zod';

// ============================================
// COMMON VALIDATORS
// ============================================

// E.164 phone number format: +[country code][number]
export const phoneE164Schema = z.string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Invalid E.164 phone number format. Must start with + followed by 7-15 digits.');

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const slugSchema = z.string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens');

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    tenantName: z.string().min(2, 'Tenant name must be at least 2 characters'),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ============================================
// TENANT SCHEMAS
// ============================================

export const createTenantSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(255),
    slug: slugSchema,
    settings: z.record(z.unknown()).optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

// ============================================
// USER SCHEMAS
// ============================================

export const userRoleSchema = z.enum(['owner', 'admin', 'operator', 'viewer']);

export const createUserSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().min(2).max(255).optional(),
    role: userRoleSchema.default('viewer'),
});

export const updateUserSchema = z.object({
    email: emailSchema.optional(),
    name: z.string().min(2).max(255).optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
});

// ============================================
// CONTACT SCHEMAS
// ============================================

export const createContactSchema = z.object({
    phoneE164: phoneE164Schema,
    name: z.string().max(255).optional(),
    tags: z.array(z.string()).default([]),
    customFields: z.record(z.unknown()).optional(),
});

export const updateContactSchema = createContactSchema.partial();

export const importContactsSchema = z.object({
    contacts: z.array(z.object({
        phone: z.string().min(1),
        name: z.string().optional(),
        tags: z.array(z.string()).optional(),
    })),
    defaultTags: z.array(z.string()).optional(),
    skipInvalid: z.boolean().default(true),
});

// ============================================
// MEDIA SCHEMAS
// ============================================

export const uploadMediaSchema = z.object({
    filename: z.string().min(1),
    mime: z.string().regex(/^image\/(png|jpeg|jpg|webp)$/, 'Only PNG, JPEG, and WebP images are allowed'),
    sizeBytes: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
});

// ============================================
// CAMPAIGN SCHEMAS
// ============================================

export const campaignTypeSchema = z.enum(['text', 'image']);
export const campaignStatusSchema = z.enum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']);

export const createCampaignSchema = z.object({
    name: z.string().min(2).max(255),
    type: campaignTypeSchema,
    templateText: z.string().optional(),
    mediaId: uuidSchema.optional().nullable(),

    // Targeting
    targetTags: z.array(z.string()).default([]),
    targetAll: z.boolean().default(true),

    // Scheduling
    scheduleAt: z.string().datetime().optional().nullable(),
    windowStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').optional().nullable(),
    windowEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)').optional().nullable(),
    timezone: z.string().default('UTC'),

    // Throttling
    throttleMinDelayMs: z.number().min(1000).max(60000).default(3000),
    throttleMaxDelayMs: z.number().min(1000).max(120000).default(8000),
    maxPerMinute: z.number().min(1).max(60).default(10),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
    status: campaignStatusSchema.optional(),
});

// ============================================
// MESSAGE SCHEMAS  
// ============================================

export const sendMessageSchema = z.object({
    phoneE164: phoneE164Schema,
    bodyText: z.string().optional(),
    mediaId: uuidSchema.optional(),
});

// ============================================
// PAGINATION SCHEMAS
// ============================================

export const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export const contactsQuerySchema = paginationSchema.extend({
    search: z.string().optional(),
    tags: z.array(z.string()).optional(),
    optedOut: z.coerce.boolean().optional(),
});

export const campaignsQuerySchema = paginationSchema.extend({
    status: campaignStatusSchema.optional(),
    type: campaignTypeSchema.optional(),
});

export const messagesQuerySchema = paginationSchema.extend({
    campaignId: uuidSchema.optional(),
    contactId: uuidSchema.optional(),
    status: z.enum(['queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled']).optional(),
    phoneE164: z.string().optional(),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
