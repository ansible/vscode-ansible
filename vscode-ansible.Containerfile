FROM node:lts-slim

WORKDIR /usr/src/app

RUN corepack enable

RUN apt-get update && \
    apt-get install -y python3 python3-pip unzip git git-lfs && \
    rm -rf /var/lib/apt/lists/*

COPY . .

RUN yarn install --immutable

RUN npm run package
