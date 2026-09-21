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

GitHub Actions runs on a dedicated, repository-scoped Docker runner. Trusted branch pushes run lint, strict contracts, Dockerfile checks, and the deterministic build contract. Pull requests into `master` and manual runs add coverage, asset validation, server and production-audit contracts, production-container smoke, and browser acceptance. The required `Master acceptance` pull-request check blocks merging when it fails; merging does not run the suite again.

See [Local GitHub Actions runner](development/self-hosted-runner.md) for the runner trust model, installation, and operations. See [Container development and deployment](development/containers.md) for application-container commands and runtime details.

## Deployment

No hosting provider or production URL has been selected. Image scanning and immutable image publication are also deferred. Future deployments should run the `runtime` image, expose container port `8080`, and use `/healthz` for health checks. Provider-specific setup belongs in separate deployment documentation once a target exists.
