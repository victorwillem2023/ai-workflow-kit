# One image that runs the same on a laptop, a small server and a cloud host. Three steps:
#   deps:  the production libraries only (npm ci --omit=dev), from the lock file
#   build: everything needed to build (`npm run build`); thrown away afterwards
#   run:   distroless Node (no shell, no package manager, no OS tools to attack with), as the nonroot user, holding only
#          what runs: the built app (dist/), its production libraries and package.json. Nothing else from the repository:
#          no source, tests, docs, scripts, git history or settings (.dockerignore keeps them out of the build too).
# The gate's *image* check holds these rules (tools/workflow/README.md, *What it checks*). Node starts directly, so the app
# gets the stop signal and can finish open requests (docs/run/PRODUCTION.md): set the last line to the app's server entry.
# Another folder the app reads at run time (migrations, public files): one more COPY --from=build line for that folder only.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM node:26-trixie-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:26-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# the same Debian (13, trixie) as the build steps, so a native library built there runs here
FROM gcr.io/distroless/nodejs26-debian13:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION PORT=8787
USER nonroot
EXPOSE 8787
# the host restarts the container when /health stops answering (Node's own fetch: there is no shell or curl in the image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# the image starts /nodejs/bin/node itself: this is only the file it runs
CMD ["dist/server.js"]
