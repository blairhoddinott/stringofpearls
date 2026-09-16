# String of Pearls roadmap

This roadmap tracks the current direction of the project. The order may change as the modernization work exposes dependencies, but the broad priorities should remain stable.

## Foundations

- [x] Rename the project to String of Pearls.
- [x] Establish reproducible development and production container workflows.
- [x] Replace broken asset validation with deterministic repository-owned checks.
- [x] Add an automated browser startup, render, and airport-selection smoke test.
- [x] Replace the Gulp/Browserify build chain with a deterministic Node 24 and esbuild pipeline.
- [x] Replace AVA 1 and NYC 14 with Node 24-compatible tests and all-module coverage floors.
- [x] Modernize ESLint and establish a clean full-repository lint baseline.
- [x] Upgrade vulnerable production dependencies behind focused compatibility tests.
- [ ] Modernize the application architecture; Phase 4 now has a browser-free per-session `SimulationContext`, isolated event dispatch, deterministic time, context-owned game timers, isolated airport-controller/navigation state, context-owned traffic patterns/scheduling, and an isolated aircraft-collection/controller seam.
  - [x] Introduce explicit platform boundaries for asset loading, storage, clock/timers, randomness, analytics, speech synthesis, clipboard, and page visibility; `npm run core:browser-free` proves the extracted core services execute without fabricated browser globals.
- [ ] Resume feature development on the modernized foundation

## Simulation and realism

- [ ] Use real-world traffic schedules
- [ ] Use real-world weather
- [ ] Simulate handoffs from center controllers
- [ ] Model service to smaller airports in the surrounding area
- [ ] Add operational holding instructions
- [ ] Divide airspace into sectors and allow users to work selected sectors where the model makes sense
- [ ] Separate arrival and departure positions so users can work either position or combine both

## Voice and interaction

- [ ] Add speech-to-text command input
- [ ] Improve text-to-speech for aircraft responses
- [ ] Allow users to reposition data tags to reduce overlap
- [ ] Add more realistic information to flight progress strips

## Scope and community

- [ ] Update the display to resemble the Raytheon STARS 6191 scope using the available manual
- [ ] Create a maintainable submission and review process for new airports
- [ ] Evaluate a leaderboard or other scoring system without turning the simulator into an arcade cabinet.

## Deferred platform decisions

- [ ] Choose a CI/CD execution model, provider, and budget after the local toolchain is stable.
