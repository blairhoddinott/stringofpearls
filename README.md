# String of Pearls

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Docker ready](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](documentation/development/containers.md)

String of Pearls is a browser-based air traffic control simulator. Work traffic on realistic scopes, issue clearances, manage arrivals and departures, and try not to manufacture an FAA incident report.

The project is being modernized from the openScope codebase. Existing simulation behavior and airport data remain useful; the obsolete build system, runtime assumptions, and global architecture are being replaced incrementally.

## Run with Docker

Docker is the supported production-like and isolated development path. Local development uses Node.js 24 and npm 11.

```sh
git clone https://github.com/blairhoddinott/stringofpearls.git
cd stringofpearls
docker compose up --build app
```

Open http://localhost:3003.

For the source-mounted development image, runtime hardening details, health checks, and future automation commands, see [Container development and deployment](documentation/development/containers.md).

## Simulator documentation

- [Command reference](documentation/commands.md)
- [Airport guides](documentation/airport-guides/airport-guide-directory.md)
- [Airport format](documentation/airport-format.md)
- [Airport file standards](documentation/airport-file-standards.md)
- [Event tracking and privacy](documentation/event-tracking.md)
- [Supported browsers](documentation/development/supported-browsers.md)

## Development

The repository builds and runs its inherited unit suite on Node 24 with a small repository-owned pipeline based on esbuild and `fs/promises`. The generated URL layout remains compatible with the inherited static site, while the production container serves it from unprivileged NGINX. NYC 14 coverage instrumentation remains a documented Node 11 compatibility gate until its separate Phase 2 migration.

Useful commands:

```sh
# Exact local install and production build
npm ci --ignore-scripts --no-audit --no-fund
npm run build

# Generated-output contract
npm run build:test

# Inherited unit suite on Node 24
npm test

# Production-like container
docker compose up --build app

# Source-mounted development container
docker compose --profile development up --build dev

# Container acceptance test
npm run docker:smoke

# Browser acceptance test
npm run browser:smoke

# Aviation asset validation
npm run validator:test
npm run validate:assets
```

Read the [modernization audit](documentation/development/modernization-audit.md) for the technical baseline and migration sequence.

## Roadmap

The canonical roadmap lives at [documentation/development/roadmap.md](documentation/development/roadmap.md). This is the current working plan.

### Foundations

- [x] Rename the project to String of Pearls
- [x] Add development and production container workflows
- [x] Add deterministic aviation asset validation
- [x] Add an automated browser startup and airport-selection smoke test
- [x] Replace the legacy JavaScript build toolchain and adopt Node 24
- [ ] Modernize the application architecture
- [ ] Resume feature development on the modernized foundation

### Simulation and realism

- [ ] Use real-world traffic schedules
- [ ] Use real-world weather
- [ ] Simulate handoffs from center controllers
- [ ] Model service to smaller airports in the surrounding area
- [ ] Add operational holding instructions
- [ ] Divide airspace into sectors and allow users to work selected sectors where the model makes sense
- [ ] Separate arrival and departure positions so users can work either position or combine both

### Voice and interaction

- [ ] Add speech-to-text command input
- [ ] Improve text-to-speech for aircraft responses
- [ ] Allow users to reposition data tags to reduce overlap
- [ ] Add more realistic information to flight progress strips

### Scope and community

- [ ] Update the display to resemble the Raytheon STARS 6191 scope using the available manual
- [ ] Create a maintainable submission and review process for new airports
- [ ] Evaluate a leaderboard or other scoring system without turning the simulator into an arcade cabinet

### Deferred platform decisions

- [ ] Choose a CI/CD execution model, provider, and budget after the local toolchain is stable

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting work. Keep changes focused, include tests where the current harness permits them, and document behavior that affects airport authors or operators.

## Privacy

The inherited client currently includes Google Analytics event tracking. See [Event tracking and privacy](documentation/event-tracking.md) for details. Removing or replacing that integration is part of the modernization work.

## License and attribution

String of Pearls is distributed under the [MIT License](LICENSE.md).

The simulator is derived from the openScope project and retains its copyright and license history. Historical references in the changelog and modernization audit are preserved where they describe the original project.
