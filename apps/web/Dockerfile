FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG API_PROXY_TARGET
ARG AUTH__JWT_SECRET
ARG NOVEL_INTERNAL_API_KEY
ENV API_PROXY_TARGET=$API_PROXY_TARGET AUTH__JWT_SECRET=$AUTH__JWT_SECRET NOVEL_INTERNAL_API_KEY=$NOVEL_INTERNAL_API_KEY
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node","server.js"]
