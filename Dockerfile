FROM node:22-alpine AS frontend-deps
WORKDIR /app/webapp/frontend
COPY webapp/frontend/package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY --from=frontend-deps /app/webapp/frontend/node_modules ./webapp/frontend/node_modules
COPY webapp/frontend/ ./webapp/frontend/
WORKDIR /app/webapp/frontend
RUN npm run build

FROM node:22-alpine AS backend-deps
WORKDIR /app/webapp
COPY webapp/backend/package*.json ./backend/
COPY --from=frontend-deps /app/webapp/frontend/node_modules ./frontend/node_modules
WORKDIR /app/webapp/backend
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV USBIP_CONFIG_DIR=/home/node/.config/usbip-web
RUN mkdir -p /home/node/.config/usbip-web && chown -R node:node /home/node/.config/usbip-web
COPY --from=backend-deps --chown=node:node /app/webapp/backend/node_modules ./webapp/backend/node_modules
COPY --chown=node:node webapp/backend/ ./webapp/backend/
COPY --from=frontend-build --chown=node:node /app/webapp/frontend/dist ./webapp/frontend/dist
WORKDIR /app/webapp/backend
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
USER node
CMD ["node", "index.js"]
