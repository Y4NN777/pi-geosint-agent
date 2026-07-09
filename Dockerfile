# Geo-OSINT Agent — Docker image
#
# Builds the three geo workspace packages (geo-tools, geo-workspace, geo-webui)
# and runs the web UI server with headless rendering support (xvfb + cutycapt).
#
# Usage:
#   docker build -t geo-osint-agent .
#   docker run -p 127.0.0.1:8080:8080 -v ./evidence:/app/evidence -v ./workspace:/app/workspace geo-osint-agent

# ── Build stage ─────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Root config files
COPY package.json package-lock.json tsconfig.base.json ./

# All monorepo packages (geo-workspace depends on ai + agent)
COPY packages/ packages/

# Install dependencies (no lifecycle scripts in build context)
RUN npm ci --ignore-scripts

# Build in dependency order: ai → agent → geo-tools → geo-workspace → geo-webui
RUN npm run build -w packages/ai && \
    npm run build -w packages/agent && \
    npm run build -w packages/geo-tools && \
    npm run build -w packages/geo-workspace && \
    npm run build -w packages/geo-webui

# ── Runtime stage ──────────────────────────────────────────────────────
FROM node:24-bookworm-slim

# Install system deps for headless rendering (stage 03)
#   xvfb       — virtual framebuffer for headless browser rendering
#   cutycapt   — WebKit-based webpage screenshot tool (called via xvfb-run)
#   chromium   — fallback headless renderer
#   ca-certificates — TLS for KartaView / geocoder API calls
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    cutycapt \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts + frontend + node_modules from builder
COPY --from=builder /app /app

# Use the non-root node user already defined in the base image
USER node

# Web UI
EXPOSE 8080

# Default: start the geo-webui server
ENTRYPOINT ["node"]
CMD ["packages/geo-webui/dist/server.js"]
