# PixyGoat – build the app, run the server. Sprites are mounted at runtime.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/app/package.json packages/app/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY data ./data
COPY locales ./locales
COPY packages ./packages
RUN npm run build --workspace @pixygoat/app

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PIXYGOAT_HOST=0.0.0.0 \
    PIXYGOAT_PORT=4600 \
    PIXYGOAT_SPRITES=/data/spritesheets \
    PIXYGOAT_CHARACTERS=/data/characters \
    PIXYGOAT_CACHE=/data/cache \
    PIXYGOAT_EXPORT_DIR=/data/exports/flat \
    PIXYGOAT_UNITY_DIR=/data/exports/unity
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/app/package.json packages/app/
RUN npm ci --omit=dev --no-audit --no-fund && npm install --no-save tsx@4 >/dev/null
COPY --from=build /app/tsconfig.base.json ./
COPY --from=build /app/data ./data
COPY --from=build /app/locales ./locales
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/server ./packages/server
COPY --from=build /app/packages/app/dist ./packages/app/dist
EXPOSE 4600
CMD ["npx", "tsx", "packages/server/src/main.ts"]
