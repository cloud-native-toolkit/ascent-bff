FROM registry.access.redhat.com/ubi9/nodejs-22:9.5-1740412185

USER default

WORKDIR /opt/app-root/src

COPY --chown=default:root . .
RUN npm ci && \
    npm run compile

ENV HOST=0.0.0.0 PORT=3001

EXPOSE ${PORT}
CMD ["npm", "run", "serve"]
