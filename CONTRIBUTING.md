# Contributing to String of Pearls

Thanks for helping improve String of Pearls. Keep changes focused and explain what they alter; reviewers should not need radar separation skills to discover the point of a pull request.

## Set up the project

Docker is the supported development path while the JavaScript toolchain is being modernized:

```sh
git clone https://github.com/blairhoddinott/stringofpearls.git
cd stringofpearls
docker compose --profile development up --build dev
```

See [Container development and deployment](documentation/development/containers.md) for direct image commands, test commands, and troubleshooting.

## Before writing code

1. Search existing issues and pull requests for related work.
2. Open an issue for substantial features, architecture changes, or airport-format changes.
3. Keep each branch limited to one coherent change.
4. Base work on the repository's current default development branch unless the issue says otherwise.

## Pull requests

A pull request should include:

- a concise description of the problem and solution;
- tests or reproducible verification steps;
- documentation for user-visible or data-format changes;
- screenshots for visual changes; and
- no unrelated formatting or dependency churn.

Draft pull requests are fine for early feedback. Mark the pull request ready only after its checks pass and the description reflects the final change.

## Quality checks

Run the checks relevant to your change. The current baseline includes legacy tooling, so consult the [modernization audit](documentation/development/modernization-audit.md) before assuming every old command works on a current Node release.

```sh
npm run docker:smoke
```

Airport and aircraft data changes must follow the documented schemas and file standards.

## Commit messages

Use present-tense, concise commit messages. Conventional Commit prefixes are preferred:

```text
feat: add sector selection
fix: prevent duplicate departure handoffs
docs: clarify airport terrain generation
build: update container image
```

All commits made by project automation are cryptographically signed. Human contributors are encouraged to sign commits as well.

## Reviews

Reviewers may request changes for correctness, maintainability, security, test coverage, or inaccurate aviation behavior. Resolve review threads with code or a clear technical explanation. "Works on my machine" remains an observation, not a test plan.

## Documentation

Project documentation lives in [`documentation/`](documentation/). Update it in the same pull request when behavior, setup, commands, or data formats change.
