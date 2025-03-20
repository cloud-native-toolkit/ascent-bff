FROM registry.access.redhat.com/ubi8/nodejs-16-minimal:1-79

USER 1001

WORKDIR /opt/app-root/src

COPY --chown=1001 . .
RUN npm install && \
    npm run compile

ENV NODE_ENV=staging HOST=0.0.0.0 PORT=3001

EXPOSE ${PORT}
CMD ["npm", "run", "serve"]
