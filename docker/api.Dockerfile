FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=apps/api

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Install production dependencies only
RUN npm ci --omit=dev --workspace=packages/shared --workspace=apps/api

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
