# Use the official Playwright image — Chromium is pre-installed
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY api/ ./api/

# Non-root user (required by some Azure policies)
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 3000

# API_KEY env var is optional — set it in Azure Container Apps secrets
# to enable x-api-key authentication
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "api/server.js"]
