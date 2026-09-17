# Environments

String of Pearls uses containers to keep development and deployment behavior consistent. The project does not currently operate a public production service.

## Development

The `development` image contains Node.js, the source tree, and the legacy build dependencies. Docker Compose mounts the repository into the container and stores dependencies in a named volume.

```sh
docker compose --profile development up --build dev
```

The development server is available at http://localhost:3003 and binds to the loopback interface by default.

## Production-like local environment

The `app` service builds the static site and serves it from an unprivileged NGINX container:

```sh
docker compose up --build app
```

This is the closest local approximation of a future deployment. It uses the same runtime image, health endpoint, cache rules, and filesystem restrictions intended for CI/CD.

## CI

CI/CD is planned but not yet configured. The intended pipeline will validate the Dockerfile, run the container smoke test, scan the runtime image, and publish immutable images only after all checks pass.

See [Container development and deployment](development/containers.md) for commands and runtime details. The [roadmap](development/roadmap.md) tracks CI/CD implementation.

## Deployment

No hosting provider or production URL has been selected. Future deployments should run the `runtime` image, expose container port `8080`, and use `/healthz` for health checks. Provider-specific setup belongs in separate deployment documentation once a target exists.
