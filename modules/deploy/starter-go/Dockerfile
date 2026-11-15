# One image that runs the same on a laptop, a small server and a cloud host. The program is cmd/{{PREFIX}} (change it when
# yours differs).
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM golang:1 AS build
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app ./cmd/{{PREFIX}}

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/app /app
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8787
EXPOSE 8787
ENTRYPOINT ["/app"]
