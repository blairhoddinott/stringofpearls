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
- [ ] Modernize the application architecture.
  - [x] Introduce explicit platform boundaries for asset loading, storage, clock/timers, randomness, analytics, speech synthesis, clipboard, and page visibility; `npm run core:browser-free` proves the extracted core services execute without fabricated browser globals.
  - [x] Complete Phase 4: establish browser-free per-session simulation contexts with explicit ownership and deterministic two-context isolation.
  - [ ] Complete Phase 5: decompose presentation hotspots without pulling UI concerns back into the simulation context.
    - [x] Extract canvas render scheduling and dirty-state policy from `CanvasController` into a pure browser-free service while preserving frame ordering and retry-on-render-failure behavior.
    - [x] Extract browser canvas creation, context ownership, resizing, HiDPI adjustment, clearing, and teardown into a dedicated `CanvasHost`.
    - [x] Make the existing canvas viewport/camera model explicitly constructible and inject one exact viewport through `CanvasController` and its default `CanvasHost`, while retaining the legacy singleton for unmigrated presentation consumers.
    - [x] Extract airport runway bodies, extended centerlines, and reciprocal labels into an injected `AirportRunwayRenderer` while preserving their two static-render order positions.
    - [x] Extract airport fixes plus SID/STAR geometry and labels into an injected `AirportNavigationRenderer` while preserving their three static-render order positions and shared airspace-label behavior.
    - [x] Extract video maps, terrain, restricted areas, airspace shelves/borders, range rings, and their labels into an injected `AirportBackgroundRenderer` while preserving their five static-render order positions.
    - [x] Extract measurement paths, turn geometry, label backgrounds, and text into an injected `MeasurementOverlayRenderer` while preserving the final dynamic-render position.
    - [x] Extract radar returns, history dots, separation indicators, projected paths, vector lines, halos, conflict rings, and target dots into an injected `AircraftTargetRenderer` while preserving the dynamic-render order before data blocks.
    - [x] Extract the selected-aircraft compass and aircraft data blocks into an injected `AircraftAnnotationRenderer` while preserving their dynamic-render slots around aircraft targets.
    - [x] Extract browser input registration and teardown into an injected `InputEventBindings` boundary while preserving the inherited wheel, context-menu, and strip-click lifecycle behavior for a separate repair checkpoint.
    - [x] Extract measurement point conversion, snapping, lifecycle, and render invalidation into an injected `MeasurementInteraction` while retaining pointer and keyboard routing in `InputController`.
    - [x] Extract aircraft selection, callsign lookup, command-input focus, selection events, and aircraft history navigation into an injected `AircraftSelectionInteraction` while retaining public controller routing methods.
    - [x] Extract aircraft/scope/system command parsing, dispatch, history mutation, diagnostics, and command side effects into an injected `CommandInteraction` while retaining public controller routing methods.
    - [x] Extract wheel zoom, configurable drag-button matching, pan anchoring and deltas, mouse release, and zoom reset into an injected `ViewportGestureInteraction` while retaining measurement-first and semantic mouse routing in `InputController`.
    - [x] Extract keyboard normalization, dialog/autocomplete gating, shortcuts, command-bar editing, context toggling, Escape policy, and keyup measurement behavior into an injected `KeyboardInteraction` while retaining controller event façades.
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
