# ─────────────────────────────────────────────────────────────────
# Stage 1: install dependencies & build
# ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS build

# Install OS deps for headless Chrome
RUN apt-get update && apt-get install -y \
  ca-certificates fonts-liberation gconf-service libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 \
  libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files and install with legacy-peer-deps to avoid puppeteer conflicts
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy source
COPY . .

# ─────────────────────────────────────────────────────────────────
# Stage 2: runtime image
# ─────────────────────────────────────────────────────────────────
FROM node:20-slim

# Install OS deps for headless Chrome
RUN apt-get update && apt-get install -y \
  ca-certificates fonts-liberation gconf-service libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgcc1 libgdk-pixbuf2.0-0 libglib2.0-0 \
  libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 xdg-utils \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy built files & node_modules from build stage
COPY --from=build /usr/src/app ./

# Environment
ENV PORT=8080 \
  GOOGLE_CLOUD_DISABLE_GCE_METADATA=true

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/healthz || exit 1

# Launch
CMD ["node", "src/app.js"]
