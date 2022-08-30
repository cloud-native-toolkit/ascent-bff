FROM registry.access.redhat.com/ubi8/nodejs-14:1-28.1618434924

USER default

WORKDIR /opt/app-root/src

COPY --chown=default . .

RUN ls -lA && npm i -g yarn && \
    yarn install && \
    yarn cache clean && \
    yarn build

LABEL name="ibm/template-node-typescript" \
      vendor="IBM" \
      version="1" \
      release="28.1618434924" \
      summary="This is an example of a container image." \
      description="This container image will deploy a Typescript Node App"

COPY --chown=default licenses licenses
COPY --chown=default public public

ENV HOST=0.0.0.0 PORT=3001

EXPOSE ${PORT}
CMD ["npm", "run", "serve"]
