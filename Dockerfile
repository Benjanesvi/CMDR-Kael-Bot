# Optional: you can delete this file if you use Render's native Node runtime
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

CMD ["node", "--enable-source-maps", "dist/index.js"]
