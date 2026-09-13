# Container Development and Deployment

The repository provides separate container targets for development and runtime use:

- `development` contains Node.js, the legacy build toolchain, and the source tree.
- `build` compiles the production assets and is not shipped.
- `runtime` contains only the generated static site and unprivileged NGINX.

The runtime image does not contain Node.js, npm, source files, or development dependencies.

## Prerequisites

- Docker Engine with BuildKit support
- Docker Compose v2 or later
- Permission to access the Docker daemon

If Docker reports permission errors for `/var/run/docker.sock`, configure Docker access for your account or prefix the commands with `sudo`. Do not make the socket world-writable. That "fix" is merely root access wearing a fake moustache.

## Production-like local environment

Build and start the hardened runtime container:

```sh
docker compose up --build app
```

Open http://localhost:3003.

Use a different host port with the `PORT` environment variable:

```sh
PORT=8080 docker compose up --build app
```

Stop and remove the application resources:

```sh
docker compose down
```

The Compose service applies the following runtime restrictions:

- unprivileged UID 101
- read-only root filesystem
- all Linux capabilities dropped
- `no-new-privileges`
- writable memory-backed `/tmp`
- container health check

## Development environment

Start the source-mounted development container:

```sh
docker compose --profile development up --build dev
```

Open http://localhost:3003.

The development service:

- mounts the repository at `/workspace`
- stores container dependencies in the `dependencies` named volume
- performs a complete development build on startup
- serves the generated application with the existing Express development server

The legacy Gulp watcher covers only JavaScript and LESS. The container therefore does not pretend to provide complete hot reload: restart the `dev` service after changing templates, airport data, guides, or other copied assets.

Run repository commands in an isolated development container:

```sh
docker compose --profile development run --rm dev npm test
docker compose --profile development run --rm dev npm run lint
```

The current AVA test harness is not compatible with Node 24 and will fail until the test-tooling modernization is complete. The container is still useful for dependency installation, builds, and targeted development commands.

Remove the dependency volume after changing the lockfile or if the installation becomes stale:

```sh
docker compose down --volumes
```

## Direct image commands

Build the production runtime image:

```sh
docker build --target runtime --tag stringofpearls:local .
```

Run it directly:

```sh
docker run --rm --publish 3003:8080 stringofpearls:local
```

Build the development image:

```sh
docker build --target development --tag stringofpearls:development .
```

## Verification

Run the end-to-end container acceptance test:

```sh
npm run docker:smoke
```

The script verifies that:

1. the production image builds;
2. the runtime user is non-root;
3. the container becomes healthy;
4. the home page is served;
5. representative airport JSON is served; and
6. the configured security header is present.

The script automatically uses passwordless `sudo` when the current account cannot access the Docker daemon directly.

Run the browser acceptance test:

```sh
npm run browser:smoke
```

This starts the production image on an isolated Compose network and runs a digest-pinned Playwright container against it. The test covers completed startup, a render frame, canvas initialization, airport selection, and uncaught browser errors. See [Supported browsers](supported-browsers.md) for the exact contract.

Validate only the Compose model:

```sh
docker compose config --quiet
```

## Runtime contract

- Container port: `8080`
- Health endpoint: `/healthz`
- Static root: `/usr/share/nginx/html`
- Missing `/assets/*` resources return `404`.
- Other unknown routes fall back to `index.html`, matching the historical static-host configuration.
- HTML is served with `Cache-Control: no-store, no-cache`.
- generated assets use a cache lifetime of 512,000 seconds.
- `.geojson` files are served as `application/json`.

## Future automation contract

CI/CD provider and runner decisions are intentionally deferred. Whatever automation is selected later can invoke the same repository-owned checks used locally:

1. run `docker build --check .`;
2. run `npm run docker:smoke`;
3. run `npm run validator:test` and `npm run validate:assets`;
4. run `npm run browser:smoke`;
5. build the `runtime` target with an immutable commit tag;
6. scan the final image;
7. publish only after tests and scanning pass.

Both base images are pinned by digest in `Dockerfile`. Update the human-readable tag and digest together. The tags document intent; the digests determine what is actually built.

The old npm dependency graph remains a build-time risk and emits deprecation warnings. It is excluded from the final NGINX image, but containerization does not magically make obsolete dependencies healthy. That work remains in the modernization roadmap.
