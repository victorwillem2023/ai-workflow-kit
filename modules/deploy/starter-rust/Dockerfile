# One image that runs the same on a laptop, a small server and a cloud host. The program is the package name in Cargo.toml
# ({{PREFIX}} below: change it when yours differs).
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM rust:1-slim-trixie AS build
WORKDIR /app
COPY . .
RUN cargo build --release --locked

FROM debian:trixie-slim
RUN useradd --system app
COPY --from=build /app/target/release/{{PREFIX}} /usr/local/bin/app
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8787
USER app
EXPOSE 8787
CMD ["app"]
