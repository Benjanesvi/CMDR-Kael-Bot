# Dockerfile - Node 20, multi-stage for smaller images
# ---- deps layer ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- build layer ----
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy node deps and built artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

# If you rely on native libs or locale data, add them here:
# RUN apk add --no-cache libc6-compat

CMD ["node", "--enable-source-maps", "dist/index.js"]
