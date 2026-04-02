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
RUN npm ci
COPY src/ ./src/
RUN npx tsc

# --- Production ---
FROM node:22-alpine
RUN apk add --no-cache ffmpeg python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=backend /app/dist ./dist/
COPY --from=frontend /app/frontend/dist ./frontend/dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
