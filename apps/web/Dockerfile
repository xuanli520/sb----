FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The build runs against the public npm registry. Retry transient connection resets rather than
# treating a short external-network interruption as a deterministic build failure.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 2000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN addgroup -S -g 10001 novel && adduser -S -D -H -u 10001 -G novel novel \
 && chown novel:novel /app
COPY --chown=novel:novel --from=build /app/.next/standalone ./
COPY --chown=novel:novel --from=build /app/.next/static ./.next/static
COPY --chown=novel:novel --from=build /app/public ./public
USER novel
EXPOSE 3000
# Docker supplies HOSTNAME as the container id by default. Next standalone would bind to that
# single interface, leaving loopback health checks unavailable; bind explicitly to every address.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
