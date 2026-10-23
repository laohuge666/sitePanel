FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config.js index.js monitor-manager.js ./
COPY public ./public
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data
USER node
CMD ["node", "index.js"]
