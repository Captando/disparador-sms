import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, UserRole } from '@sms/shared';
import { hasPermission } from '@sms/shared';

// Extend FastifyRequest with user context
declare module 'fastify' {
    interface FastifyRequest {
        user?: JwtPayload;
        tenantId?: string;
    }
}

/**
 * Authentication middleware - validates JWT and injects user context
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
    try {
        const payload = await request.jwtVerify<JwtPayload>();
        request.user = payload;
        request.tenantId = payload.tenantId;
    } catch (err) {
        reply.status(401).send({
            success: false,
            error: 'Unauthorized: Invalid or expired token'
        });
    }
}

/**
 * RBAC middleware factory - checks user permissions
 */
export function requirePermission(permission: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.user) {
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!hasPermission(request.user.role, permission)) {
            return reply.status(403).send({
                success: false,
                error: `Forbidden: Missing permission '${permission}'`
            });
        }
    };
}

/**
 * Role requirement middleware factory
 */
export function requireRole(...roles: UserRole[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.user) {
            return reply.status(401).send({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!roles.includes(request.user.role)) {
            return reply.status(403).send({
                success: false,
                error: `Forbidden: Requires one of roles: ${roles.join(', ')}`
            });
        }
    };
}

/**
 * Tenant isolation middleware - ensures all queries are scoped to tenant
 * This is applied automatically to route handlers
 */
export function getTenantCondition(request: FastifyRequest): { tenantId: string } {
    if (!request.tenantId) {
        throw new Error('Tenant ID not set - authentication middleware not applied');
    }
    return { tenantId: request.tenantId };
}
