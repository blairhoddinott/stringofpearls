#!/usr/bin/env bash

set -euo pipefail

readonly RUNNER_HOME=/home/node/actions-runner
readonly RUNNER_STATE=/runner-state
readonly -a STATE_FILES=(.credentials .credentials_rsaparams .env .path .runner)

RUNNER_REPOSITORY_URL="${RUNNER_REPOSITORY_URL:-}"
RUNNER_NAME="${RUNNER_NAME:-}"
RUNNER_LABELS="${RUNNER_LABELS:-}"
REGISTRATION_TOKEN="${REGISTRATION_TOKEN:-}"

cd "${RUNNER_HOME}"
umask 077

require_variable() {
    local name=$1

    if [[ -z "${!name:-}" ]]; then
        printf 'error: %s is required\n' "${name}" >&2
        exit 1
    fi
}

link_state_files() {
    local file

    for file in "${STATE_FILES[@]}"; do
        if [[ -f "${RUNNER_STATE}/${file}" ]]; then
            rm -f "${RUNNER_HOME}/${file}"
            ln -s "${RUNNER_STATE}/${file}" "${RUNNER_HOME}/${file}"
        fi
    done
}

configure_runner() {
    require_variable RUNNER_REPOSITORY_URL
    require_variable RUNNER_NAME
    require_variable RUNNER_LABELS
    require_variable REGISTRATION_TOKEN

    if [[ -f "${RUNNER_STATE}/.runner" ]]; then
        printf '%s\n' 'error: runner state already exists; remove the runner in GitHub before re-registering' >&2
        exit 1
    fi

    ./config.sh \
        --unattended \
        --url "${RUNNER_REPOSITORY_URL}" \
        --token "${REGISTRATION_TOKEN}" \
        --name "${RUNNER_NAME}" \
        --labels "${RUNNER_LABELS}" \
        --work _work \
        --replace \
        --disableupdate

    local file
    for file in "${STATE_FILES[@]}"; do
        if [[ -f "${RUNNER_HOME}/${file}" ]]; then
            mv "${RUNNER_HOME}/${file}" "${RUNNER_STATE}/${file}"
        fi
    done

    printf 'Runner %s registered; start it with docker compose up --detach runner\n' "${RUNNER_NAME}"
}

run_runner() {
    if [[ ! -f "${RUNNER_STATE}/.runner" ]]; then
        printf '%s\n' 'error: runner is not registered; run the documented one-time configure command first' >&2
        exit 1
    fi

    link_state_files
    exec ./run.sh
}

case "${1:-run}" in
    configure)
        configure_runner
        ;;
    run)
        run_runner
        ;;
    *)
        printf 'error: unsupported command: %s\n' "$1" >&2
        exit 1
        ;;
esac
