FROM node:22-bookworm

# Create app directory
WORKDIR /usr/src/app

COPY . .
COPY ./start.sh /

# Rebuild the checked-in browser assets in the Linux image, then remove the
# build-only dependencies so they do not add weight to the runtime image.
RUN npm ci && npm run build:ui && npm prune --omit=dev

ENV BIOVALIDATOR_LOG_DIR=/tmp/biovalidator/logs \
    BIOVALIDATOR_PID_PATH=/tmp/biovalidator/server.pid

USER node

ENTRYPOINT ["/start.sh"]
