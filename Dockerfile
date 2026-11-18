FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p uploads && chown -R node:node /app
COPY --chown=node:node config ./config
COPY --chown=node:node constants ./constants
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node middleware ./middleware
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node services ./services
COPY --chown=node:node utils ./utils
COPY --chown=node:node workers ./workers
COPY --chown=node:node server.js worker.js ./
COPY --chown=node:node uploads ./uploads
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 5000
CMD ["node", "server.js"]
