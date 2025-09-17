# Optional Docker path (Render can run Node without Docker)
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

CMD ["node", "--enable-source-maps", "dist/index.js"