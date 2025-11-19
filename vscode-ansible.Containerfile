# container used for building and testing our own repository code
FROM ghcr.io/jdx/mise:latest

ENV CI=1
ENV MISE_TRUSTED_CONFIG_PATHS=/
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV SKIP_UI=1
WORKDIR /usr/src/app

# install ansible-dev-tools specific packages and dependencies while avoiding
# adding multiple layers to the image.
# cspell:disable-next-line
RUN apt-get update && apt-get install -q -y golang-github-go-enry-go-oniguruma-dev sudo curl
COPY . .
RUN --mount=type=cache,target=/root/.local/share/mise,sharing=locked \
--mount=type=cache,target=/root/.cache/mise,sharing=locked \
mise install && \
mise list && \
mise exec -- uv sync --no-progress -q --active && \
mise exec -- python --version && \
free -h
RUN mise exec -- task setup
RUN mise exec -- task install
RUN mise exec -- task package
