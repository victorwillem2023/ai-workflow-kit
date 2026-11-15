# One image that runs the same on a laptop, a small server and a cloud host. uv installs exactly what uv.lock says.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN uv sync --frozen --no-dev && useradd --system app
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8787 PATH="/app/.venv/bin:$PATH"
USER app
EXPOSE 8787
# fit this line to the app: the module that holds the server
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8787"]
