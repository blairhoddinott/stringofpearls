# String of Pearls

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Docker ready](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](documentation/development/containers.md)

String of Pearls is a browser-based air traffic control simulator. Work traffic on realistic scopes, issue clearances, manage arrivals and departures, and try not to manufacture an FAA incident report.

String of Pearls is an independent community fork of the openScope codebase. It retains the inherited simulation behavior, airport data, Git history, license, and attribution while replacing obsolete build infrastructure and isolating platform, simulation, presentation, and input responsibilities behind characterized boundaries.

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

The repository builds, tests, and measures coverage on Node 24 with a small repository-owned pipeline based on esbuild, `fs/promises`, AVA 6, and c8. Native build and watch execution requires Linux with `/proc` and util-linux `flock`; macOS and Windows contributors should use the supported container workflow. The generated URL layout remains compatible with the inherited static site, while the production container serves it from unprivileged NGINX.

Useful commands:

```sh
# Exact local install and production build
npm ci --ignore-scripts --no-audit --no-fund
npm run build

# Generated-output contract
npm run build:test

# Inherited unit suite on Node 24
npm test

# All-module coverage with regression floors
npm run test:coverage

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
- [x] Modernize the application architecture through the Phase 5 boundary decomposition
- [x] Resume feature development on the modernized foundation

### Simulation and realism

- [ ] Use real-world traffic schedules
- [ ] Use real-world weather
- [ ] Simulate handoffs from center controllers
- [ ] Model service to smaller airports in the surrounding area
- [ ] Add operational holding instructions
- [ ] Divide airspace into sectors and allow users to work selected sectors where the model makes sense
- [x] Let users choose arrivals, departures, or both for the current simulator session

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

The client supports optional Google Analytics event tracking through an explicit adapter configured at the browser composition root. See [Event tracking and privacy](documentation/event-tracking.md) for details.

## License and attribution

String of Pearls is distributed under the [MIT License](LICENSE.md).

The simulator is derived from the openScope project and retains its copyright and license history. Historical references in the changelog and modernization audit are preserved where they describe the original project.
