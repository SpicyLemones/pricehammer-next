# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Needed by Next.js native deps (sharp, etc.)
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run stage ----
FROM node:20-alpine AS run
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Env (Hyperlift can override these)
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DB_PATH=/data/data.sqlite

# Copy built app and node_modules from build stage
COPY --from=build /app ./

# If you’re mounting a persistent volume at /data this ensures the dir exists
RUN mkdir -p /data

# Optional: keep only prod deps (saves space)
RUN npm prune --omit=dev

EXPOSE 3000
CMD ["npm","run","start"]
