# container used for building and testing our own repository code
FROM ghcr.io/jdx/mise:latest

LABEL org.opencontainers.image.source=https://github.com/ansible/vscode-ansible
LABEL org.opencontainers.image.authors="Ansible"
LABEL org.opencontainers.image.vendor="Red Hat"
LABEL org.opencontainers.image.licenses="GPL-3.0"
LABEL org.opencontainers.image.description="Internal builder for vscode-ansible repository."
ENV MISE_TRUSTED_CONFIG_PATHS=/
USER 0

WORKDIR /context
# install ansible-dev-tools specific packages and dependencies while avoiding
# adding multiple layers to the image.
RUN apt-get update
# cspell:disable-next-line
RUN apt-get install -q -y golang-github-go-enry-go-oniguruma-dev
RUN --mount=type=bind,target=. ls /context
RUN --mount=type=bind,target=. mise install && mise list && mise exec -- uv sync --no-progress -q --active && mise exec -- python --version
