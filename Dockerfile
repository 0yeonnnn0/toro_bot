# --- Frontend build ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json frontend/.npmrc ./
RUN npm ci --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# --- Backend build ---
FROM node:22-alpine AS backend
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY src/ ./src/
RUN npx tsc

# --- Production ---
FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3 make g++ py3-pip curl \
    && pip3 install --break-system-packages yt-dlp \
    && npm install -g @openai/codex
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=backend /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend /app/dist ./dist/
COPY --from=frontend /app/frontend/dist ./frontend/dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://localhost:${DASHBOARD_PORT:-3000}/healthz || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
