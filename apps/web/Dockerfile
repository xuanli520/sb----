FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
# Docker supplies HOSTNAME as the container id by default. Next standalone would bind to that
# single interface, leaving loopback health checks unavailable; bind explicitly to every address.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
