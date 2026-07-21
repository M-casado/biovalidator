FROM node:18-buster

# Create app directory
WORKDIR /usr/src/app

COPY . .
COPY ./start.sh /

# Rebuild the checked-in browser assets in the Linux image, then remove the
# build-only dependencies so they do not add weight to the runtime image.
RUN npm install && npm run build:ui && npm prune --omit=dev

ENTRYPOINT ["/start.sh"]
