FROM node:lts-alpine

WORKDIR /home/node
USER node

# Install app dependencies
COPY --chown=node:node index.js package.json package-lock.json ./
COPY --chown=node:node lib ./lib/
RUN mkdir watched && npm ci

ENV WATCHER_PATH="/home/node/watched" \
WATCHER_HISTORY="/home/node/history/history.json"
ENTRYPOINT [ "node", "index.js" ]
