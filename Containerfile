# container used for building and testing our own repository code
FROM ghcr.io/jdx/mise:latest

LABEL org.opencontainers.image.source=https://github.com/ansible/vscode-ansible
LABEL org.opencontainers.image.authors="Ansible"
LABEL org.opencontainers.image.vendor="Red Hat"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.description="Internal builder for vscode-ansible repository."
ENV CI=1
ENV DEBIAN_FRONTEND=noninteractive
ENV SKIP_LFS=1
ENV SKIP_PODMAN=1
ENV SKIP_DOCKER=1
ENV MISE_TRUSTED_CONFIG_PATHS=/
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV PATH=/root/.local/bin:${PATH}
USER 0

WORKDIR /context
# install ansible-dev-tools specific packages and dependencies while avoiding
# adding multiple layers to the image.
# cspell:disable
RUN --mount=type=cache,target=/var/cache/apt/archives/,sharing=locked --mount=type=cache,target=/var/lib/apt/lists/,sharing=locked DEBIAN_FRONTEND=noninteractive apt-get update -qq -y -o=Dpkg::Use-Pty=0 && apt-get install -qq -y -o=Dpkg::Use-Pty=0 --no-install-recommends \
curl \
file \
git \
git-lfs \
golang-github-go-enry-go-oniguruma-dev \
libasound2 \
libatk-bridge2.0-0 \
libatk1.0-0 \
libatspi2.0-0 \
libcairo2 \
libcups2 \
libdbus-1-3 \
libdrm2 \
libgbm1 \
libgdk-pixbuf-2.0-0 \
libgtk-3-0 \
libnspr4 \
libnss3 \
libpango-1.0-0 \
libpangocairo-1.0-0 \
libxcb1 \
libxcomposite1 \
libxdamage1 \
libxfixes3 \
libxkbcommon0 \
libxrandr2 \
libxshmfence1 \
lsof \
sudo \
xvfb
RUN --mount=type=bind,target=. \
--mount=type=cache,target=/root/.local/share/mise,sharing=locked \
--mount=type=cache,target=/root/.cache/mise,sharing=locked \
ls -la /context && \
mkdir -p /root/.local/bin && \
mise install && \
mise list && \
mise exec -- uv sync --no-progress -q --active && \
mise exec -- python --version
