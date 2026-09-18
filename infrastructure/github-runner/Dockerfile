# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ARG DOCKER_CLI_IMAGE=docker:29.7.2-cli@sha256:3f4743208d2338c934d7b8bcfbe1bb54c0b2355c510ad5e0f31c0c4a54bd704e

FROM ${DOCKER_CLI_IMAGE} AS docker-cli

FROM ${NODE_IMAGE}

ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
ARG ACTIONLINT_VERSION=1.7.12
ARG ACTIONLINT_SHA256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        libicu72 \
        libkrb5-3 \
        libssl3 \
        shellcheck \
        unzip \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /home/node/actions-runner

RUN curl --fail --location --silent --show-error \
        --output actions-runner.tar.gz \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && printf '%s  %s\n' "${RUNNER_SHA256}" actions-runner.tar.gz | sha256sum --check --strict \
    && tar --extract --gzip --file actions-runner.tar.gz \
    && rm actions-runner.tar.gz \
    && mkdir --parents /runner-state _diag _work \
    && chown --recursive node:node /home/node/actions-runner /runner-state

RUN curl --fail --location --silent --show-error \
        --output /tmp/actionlint.tar.gz \
        "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" \
    && printf '%s  %s\n' "${ACTIONLINT_SHA256}" /tmp/actionlint.tar.gz | sha256sum --check --strict \
    && tar --extract --gzip --file /tmp/actionlint.tar.gz --directory /usr/local/bin actionlint \
    && rm /tmp/actionlint.tar.gz \
    && chmod 0755 /usr/local/bin/actionlint

COPY --chown=node:node entrypoint.sh /usr/local/bin/github-runner-entrypoint

USER node

ENTRYPOINT ["/usr/local/bin/github-runner-entrypoint"]
CMD ["run"]
