# syntax=docker/dockerfile:1
# Se compila en la arquitectura del Mac y solo se copia JS (sin dependencias nativas): vale para amd64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN npm i -g pnpm@12.4.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
ARG APP_VERSION=0.0.0
ENV APP_VERSION=$APP_VERSION NODE_ENV=production PORT=3000 DATA_DIR=/data WEB_DIR=/app/dist/client
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
