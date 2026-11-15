# One image that runs the same on a laptop, a small server and a cloud host. uv installs exactly what uv.lock says, in a build
# stage; the image that runs holds only the installed app and its libraries (no tests, no git data, no uv).
#   docker build --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t {{PREFIX}} .
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# the same Python as the build stage, so the libraries built there run here; the app is its src/ folder
FROM python:3.13-slim-bookworm
RUN useradd --system app
COPY --from=build /app/.venv /app/.venv
COPY src /app/src
# the commit this image was built from: /health answers with it, so a deploy can prove the new version runs
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=8787 PATH="/app/.venv/bin:$PATH" PYTHONPATH=/app/src
USER app
EXPOSE 8787
# fit this line to the app: the module that holds the server
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8787"]
