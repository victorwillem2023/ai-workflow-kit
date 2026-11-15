# One image that runs the same on a laptop, a small server and a cloud host, in two steps. The first installs and builds
# (`npm run build`); the second holds only what runs: Node, the built app and its production libraries, and not npm: the
# running app never needs it, and it carries most of a base image's known vulnerabilities (the release scan fails on them).
# It starts `node` directly, so the app itself gets the stop signal and can finish open requests (docs/PRODUCTION.md):
# set the last line to the app's server entry.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM node:26-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
# what only installs packages goes: npm, npx, corepack and yarn
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build /app ./
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION PORT=8787
USER node
EXPOSE 8787
# the host restarts the container when /health stops answering (Node's own fetch: the slim image has no curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
