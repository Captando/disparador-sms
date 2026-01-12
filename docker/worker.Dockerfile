FROM node:20-bookworm AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/worker/package*.json ./apps/worker/

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=apps/worker

# Copy source code
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Build
RUN npm run build -w packages/shared
RUN npm run build -w apps/worker

# Production image with Playwright dependencies
FROM node:20-bookworm

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/worker/package*.json ./apps/worker/
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Install production dependencies
RUN npm ci --omit=dev --workspace=packages/shared --workspace=apps/worker

# Install Playwright browsers
RUN npx playwright install chromium

# Create directories for sessions and tmp
RUN mkdir -p /data/sessions /tmp

# Run as non-root user for security
RUN groupadd -r worker && useradd -r -g worker worker
RUN chown -R worker:worker /app /data /tmp
USER worker

CMD ["node", "apps/worker/dist/index.js"]
