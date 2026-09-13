#!/usr/bin/env bash

set -euo pipefail

if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
else
    printf '%s\n' 'error: Docker daemon is unavailable' >&2
    exit 1
fi

PROJECT_NAME="stringofpearls-browser-smoke-${PPID}-$$"
COMPOSE=("${DOCKER[@]}" compose --project-name "${PROJECT_NAME}" --file compose.browser-smoke.yaml)

cleanup() {
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" up --build --abort-on-container-exit --exit-code-from browser-smoke browser-smoke
