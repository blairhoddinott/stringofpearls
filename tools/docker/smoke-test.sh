#!/usr/bin/env bash

set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-stringofpearls:smoke-test}"
CONTAINER_ID=""

if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
else
    printf '%s\n' 'error: Docker daemon is unavailable' >&2
    exit 1
fi

cleanup() {
    if [[ -n "${CONTAINER_ID}" ]]; then
        "${DOCKER[@]}" rm --force "${CONTAINER_ID}" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

"${DOCKER[@]}" build --target runtime --tag "${IMAGE_NAME}" .

IMAGE_USER=$("${DOCKER[@]}" image inspect --format '{{.Config.User}}' "${IMAGE_NAME}")
if [[ -z "${IMAGE_USER}" || "${IMAGE_USER}" == "0" || "${IMAGE_USER}" == "root" ]]; then
    printf 'error: runtime image uses a privileged user: %q\n' "${IMAGE_USER}" >&2
    exit 1
fi

CONTAINER_ID=$("${DOCKER[@]}" run --detach --rm --publish 127.0.0.1::8080 "${IMAGE_NAME}")

for _ in $(seq 1 30); do
    HEALTH=$("${DOCKER[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${CONTAINER_ID}")
    if [[ "${HEALTH}" == "healthy" ]]; then
        break
    fi
    if [[ "${HEALTH}" == "exited" || "${HEALTH}" == "dead" ]]; then
        "${DOCKER[@]}" logs "${CONTAINER_ID}" >&2
        exit 1
    fi
    sleep 1
done

if [[ "${HEALTH}" != "healthy" ]]; then
    "${DOCKER[@]}" logs "${CONTAINER_ID}" >&2
    printf 'error: container health is %s\n' "${HEALTH}" >&2
    exit 1
fi

PORT_MAPPING=$("${DOCKER[@]}" port "${CONTAINER_ID}" 8080/tcp)
HOST_PORT="${PORT_MAPPING##*:}"
BASE_URL="http://127.0.0.1:${HOST_PORT}"

curl --fail --silent --show-error "${BASE_URL}/healthz" | tr -d '\r' | diff -u <(printf 'ok\n') -
curl --fail --silent --show-error --output /dev/null "${BASE_URL}/"
curl --fail --silent --show-error --output /dev/null "${BASE_URL}/assets/airports/airportLoadList.json"

HEADERS=$(curl --fail --silent --show-error --head "${BASE_URL}/")
if [[ "${HEADERS}" != *"X-Content-Type-Options: nosniff"* ]]; then
    printf '%s\n' 'error: missing X-Content-Type-Options header' >&2
    exit 1
fi

printf 'image=%s\nuser=%s\nhealth=%s\nurl=%s\n' "${IMAGE_NAME}" "${IMAGE_USER}" "${HEALTH}" "${BASE_URL}"
