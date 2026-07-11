# syntax=docker/dockerfile:1.7

FROM node:20.11-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=shared --workspace=backend

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig*.json ./
COPY shared shared
COPY backend backend
RUN npm run build -w shared && npm run build -w backend

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
WORKDIR /app/backend
EXPOSE 8080
USER node
CMD ["node", "dist/server.js"]
