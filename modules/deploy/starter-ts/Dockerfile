# One image that runs the same on a laptop, a small server and a cloud host. It builds with `npm run build` and starts with
# `npm start`: fit those two scripts in package.json to the app, not this file.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
COPY --from=build /app ./
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION PORT=8787
USER node
EXPOSE 8787
CMD ["npm", "start"]
