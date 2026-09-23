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

# Read the application version from package.json on the host (where the manifest
# is present) and export it so the smoke container can suppress the "what's new"
# dialog deterministically for the version under test.
APP_VERSION="$(node -p "require('./package.json').version")"
export APP_VERSION

PROJECT_NAME="stringofpearls-browser-smoke-${PPID}-$$"
COMPOSE=("${DOCKER[@]}" compose --project-name "${PROJECT_NAME}" --file compose.browser-smoke.yaml)

cleanup() {
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" up --build --abort-on-container-exit --exit-code-from browser-smoke browser-smoke
