# Modernization Audit

## Decision

Modernize incrementally. Do not rewrite the simulator.

The current application builds and runs in a current browser, and its legacy test suite still passes on its pinned runtime. The simulation and aviation data are the valuable parts. The build system, runtime assumptions, global state, and quality gates should be replaced around them using a strangler-style migration.

## Verified baseline

Audit date: 2026-09-12

Branch: `modernization`

### Runtime and build

- Declared runtime: Node 11.3.0 and npm 6.4.0.
- Legacy baseline runtime tested: Node 11.3.0 and npm 6.4.1.
- Modern runtime tested: Node 26.8.2 and npm 11.19.1.
- `npm ci --ignore-scripts` completed on Node 26 and installed 1,746 packages, with extensive engine and deprecation warnings.
- `npm run build` did not resolve the local Gulp executable under npm 11.
- Invoking the locked Gulp executable directly completed a production build on Node 26 in approximately 21 seconds.
- The generated server returned HTTP 200.
- Chromium loaded the application, rendered two canvases, selected the Seattle TRACON scenario, and reported no captured runtime or unhandled-promise errors during an eight-second startup smoke test.
- At the time of the audit, the generated page still used the original openScope name and branding. Phase 0 subsequently replaced the visible identity while preserving historical attribution.

Phase 1 replaced those declarations with Node 24.21.0 and npm 11.19.0, regenerated the root lockfile as lockfile version 3, and replaced Gulp/Browserify/Babelify/Uglify/Vinyl with `tools/build.js`. The production build now completes in approximately two seconds in the pinned Node container.

### Tests and coverage

The legacy suite was executed successfully on Node 11.3.0:

- 1,320 passing
- 17 skipped
- 14 todo
- 66.63% statements
- 62.14% branches
- 67.59% functions
- 66.89% lines

The coverage headline is optimistic. NYC is configured with `all: false`; 62 of 155 client modules are absent from LCOV and therefore do not count as zero coverage. Important absent modules include:

- `src/assets/scripts/client/App.js`
- `src/assets/scripts/client/AppController.js`
- `src/assets/scripts/client/InputController.js`
- `src/assets/scripts/client/canvas/CanvasController.js`
- `src/assets/scripts/server/index.js`

The original NYC-wrapped AVA command fails before running tests on Node 26 because legacy instrumentation dependencies are incompatible with the current runtime.

Phase 1 isolated that failure to NYC 14. The first Phase 2 slice replaced AVA 1 and NYC 14 with AVA 6.4.1 and c8 12, and updated the test-only Babel 7 stack. The unchanged Node 24 suite still reports 1,320 passing, 17 skipped, and 14 todo tests.

`npm run test:coverage` now uses `all: true` and a repository-owned manifest gate to prove that all 115 eligible source modules appear under their real paths. The measured baseline is 68.95% statements/lines, 70.92% functions, and 92.09% branches; enforced regression floors are 68%, 70%, and 90% respectively. This replaces the optimistic legacy report that omitted unvisited modules.

### Lint and validation

Full client lint currently reports:

- 49 errors
- 12 warnings

Notable classes of findings include undefined globals, import cycles, unreachable code, restricted global APIs, and style issues. The existing CI only lints changed lines, so the repository has no clean full-lint baseline.

At audit time, the asset validator was broken because `@openscope/validator` could not resolve one of its own modules. It was also declared as `latest`, making installs non-reproducible. Phase 0 replaced it with repository-owned validation.

### Dependency security

Under npm 11, `npm audit` reports:

- All dependencies: 98 vulnerable packages
  - 14 critical
  - 46 high
  - 29 moderate
  - 9 low
- Production dependencies: 11 vulnerable packages
  - 3 critical
  - 5 high
  - 3 low

Direct vulnerable production dependencies are:

- `handlebars` — critical
- `express` — high
- `lodash` — high

These counts are triage signals rather than proof of exploitability in this application. The production dependencies should nevertheless be upgraded before public deployment.

After Phase 1 removed the obsolete build graph, `npm audit` reported 70 vulnerable packages overall (9 critical, 35 high, 18 moderate, and 8 low). The first Phase 2 test-toolchain slice reduced that to 39 vulnerable packages overall (6 critical, 17 high, 9 moderate, and 7 low). Production remains unchanged at 11 vulnerable packages (3 critical, 5 high, and 3 low), because production dependency upgrades are a separate focused Phase 2 slice.

## Codebase shape

The repository contains 1,467 tracked files. A deterministic extension-based scan found:

- 273 JavaScript files with approximately 64,348 lines
- 891 JSON files with approximately 572,833 lines
- 97 Markdown files with approximately 8,609 lines
- 77 GeoJSON files with approximately 5,261 lines
- 27 LESS files with approximately 1,469 lines

Most JSON volume is airport and aviation data rather than application code.

### Runtime architecture

The application is effectively browser-only:

- Browser entry: `src/assets/scripts/client/index.js`
- Composition: `src/assets/scripts/client/App.js` and `AppController.js`
- Server entry: `src/assets/scripts/server/index.js`
- Markup: `src/index.hbs` and `src/templates/layout.hbs`
- Build: `tools/build.js`

The Node server is a 19-line Express static-file server. Simulation, timing, spawning, commands, scoring, airport loading, and canvas rendering all execute in the browser. There is no application API or authoritative server-side game state.

### Coupling and risk concentrations

The intended composition root is `AppController.setupChildren()`, but construction order is fragile and mixes classes, preconstructed singleton exports, and browser globals.

Important global or singleton state includes:

- `window.prop`
- `window.zlsa`
- `window.aircraftController`
- global `EventBus`
- global `TimeKeeper`
- global airport, navigation, game, traffic, UI, and canvas controllers

The event bus is imported broadly and obscures dependency direction. Tests recreate several globals, embedding the coupling into the test harness.

Large hotspots include:

- `AircraftModel.js` — approximately 2,853 lines
- `CanvasController.js` — approximately 2,813 lines
- `RouteModel.js` — approximately 1,772 lines
- `Fms.js` — approximately 1,193 lines
- `InputController.js` — approximately 1,130 lines
- `SpawnPatternModel.js` — approximately 1,129 lines

Known import cycles exist between math and unit conversion, airport model/controller, and the navigation/FMS/traffic-generation graph.

## Modernization principles

1. Preserve observable simulator behavior before restructuring it.
2. Change one axis at a time: tooling, architecture, types, and UI framework are separate migrations.
3. Replace global dependencies with explicit adapters and injected instances.
4. Add TypeScript at boundaries first; do not mass-convert files for cosmetic progress.
5. Keep static hosting and existing asset formats until there is a demonstrated reason to change them.
6. Prefer deterministic clock and random-number interfaces for simulation tests.
7. Make every phase independently releasable.

## Phased roadmap

### Phase 0 — Establish ownership and baseline

- [x] Complete product/package rebranding while preserving required attribution and license notices.
- [x] Document the [supported browsers](supported-browsers.md) and [deployment model](containers.md).
- [x] Capture the legacy Node 11 test result as a historical baseline: 1,320 passing, 17 skipped, and 14 todo.
- [x] Add a digest-pinned Playwright smoke test for startup, airport selection, one render frame, and absence of uncaught errors.
- [x] Replace the broken external asset validator with a repository-owned, fail-closed validator and tests.

Phase 0 also corrected the KOKC default runway references (`36R`/`36L`) to the defined `35R`/`35L` runway pair after the new validator exposed them.

Exit condition: **met**. The existing game builds in the pinned production container, validates 964 JSON/GeoJSON assets representing 104 airports, and passes the automated Chromium startup and airport-selection smoke test from a documented environment.

### Phase 1 — Replace development infrastructure

Target Node 24 LTS for production and local development. Node's release policy recommends Active or Maintenance LTS for production; Node 26 is Current rather than LTS as of this audit.[1]

- [x] Replace the Node 11 and npm 6 development pins with Node 24.21.0 and npm 11.19.0.
- [x] Regenerate the lockfile as npm lockfile version 3.
- [x] Keep every direct dependency pinned; the `@openscope/validator: latest` exception was removed in Phase 0.
- [x] Replace Browserify/Gulp/Babelify/Uglify/Vinyl bundling with a small esbuild-based pipeline.
- [x] Preserve generated asset URLs and static-host output during the migration.
- [x] Convert custom build tasks to explicit scripts using `fs/promises` and propagate asynchronous failures.

The output contract test verifies all 278 generated paths, copied bytes, airport JSON semantics, aggregate data, markup references, source maps, and repeat-build determinism. Compared with a frozen Gulp production build, 273 files are byte-identical. The only changed files are the client bundle, stylesheet, their source maps, and the timestamped `index.html`; after normalizing the timestamp, the HTML is byte-identical. Cross-process publication is serialized by running the actual build worker under `flock --no-fork`; worker termination therefore ends both the build and its kernel lock, and a regression test verifies that a killed worker cannot continue toward publication. The digest-pinned browser test also passes startup, rendering, and airport selection with zero uncaught errors.

Exit condition: **met for the Phase 1 scope**. npm 11 installation, the unchanged 1,320/17/14 unit suite, production/development builds, the output contract, asset validation, Docker acceptance, and browser acceptance pass on Node 24. The inherited ESLint command retains its measured 49-error/12-warning baseline, and NYC coverage remains a Node 11-only compatibility path. Requiring clean lint and modern coverage here would duplicate the explicitly separate Phase 2 migrations; the earlier wording of this exit condition incorrectly conflated those quality repairs with verifying their existing baselines.

CI workflow changes are explicitly deferred until the project chooses an execution model, acceptable GitHub Actions usage, and operating budget. Phase 1 must produce commands that a future CI system can invoke, but it will not select or configure that system.

### Phase 2 — Repair security and quality gates

- Upgrade Express, Handlebars, and Lodash first.
- Remove unused/deprecated packages such as old Babel proposal plugins and React preset/plugins where no JSX exists.
- Replace AVA 1, NYC 14, and the synthetic browser harness with Vitest plus jsdom, or modern AVA if migration cost proves lower.
- Replace ESLint 5 and `babel-eslint` with current ESLint flat configuration.
- Establish a clean full-repository lint baseline.
- Enable honest coverage collection for all eligible modules and introduce ratcheted thresholds from the resulting baseline.
- Add dependency review or audit policy to CI without blindly treating every dev-only advisory as production exposure.

Exit condition: zero known critical/high production advisories, clean lint, meaningful coverage, and green CI.

### Phase 3 — Introduce platform boundaries

Create explicit interfaces for:

- asset loading
- storage
- clock
- random-number generation
- analytics
- speech
- clipboard and visibility APIs

Replace direct `$.getJSON`, `window`, `localStorage`, and analytics access behind these adapters. Keep the current DOM and canvas presentation intact.

Exit condition: core services can run in tests without fabricated global browser state.

### Phase 4 — Establish a simulation context

Introduce a per-session `SimulationContext` containing:

- clock and seeded random source
- current airport and navigation graph
- aircraft collection
- traffic scheduler
- score and game options
- event dispatch

Drive simulation through a single `tick(delta)` boundary. Convert preconstructed singleton exports to injected instances. Break the airport/controller and navigation/FMS cycles by passing resolved dependencies rather than importing global registries.

Exit condition: multiple isolated simulations can be created and advanced deterministically in tests.

### Phase 5 — Decompose presentation hotspots

- Split `CanvasController` into canvas host, viewport/camera, render scheduler, and domain renderers.
- Split `InputController` into browser input, selection/measurement interaction, and command dispatch.
- Add TypeScript to asset schemas, adapter contracts, commands/events, and domain DTOs before migrating internals.
- Evaluate a component framework only after state ownership and rendering contracts are explicit.

Exit condition: UI work no longer requires editing multi-thousand-line controllers or reaching into simulation globals.

## Next implementation slice

Phase 2 should begin with the test runner now that production output parity is demonstrated:

1. replace AVA 1/NYC 14 while retaining the now-reproduced 1,320/17/14 Node 24 behavioral baseline;
2. measure honest coverage with all eligible modules included;
3. replace ESLint 5 and establish a clean baseline without mixing application refactors into configuration churn; and
4. upgrade vulnerable production dependencies with focused compatibility tests.

## Explicit non-goals for the first phases

- No React/Vue/Svelte rewrite.
- No wholesale TypeScript conversion.
- No multiplayer/backend architecture.
- No airport-data format redesign.
- No large simulation refactor before characterization coverage exists.
- No CI provider, runner topology, or GitHub Actions redesign until the project makes that decision separately.

## Sources

[1] https://nodejs.org/en/about/previous-releases — Node.js Releases
