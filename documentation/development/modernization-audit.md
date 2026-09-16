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

`npm run test:coverage` now uses `all: true` and a repository-owned manifest gate to prove that all 115 eligible source modules appear under their real paths. The measured baseline is 68.96% statements/lines, 70.92% functions, and 92.27% branches; enforced regression floors are 68%, 70%, and 90% respectively. This replaces the optimistic legacy report that omitted unvisited modules.

### Lint and validation

The inherited full-client lint baseline reported:

- 49 errors
- 12 warnings

Notable classes of findings included undefined globals, import cycles, unreachable code, restricted global APIs, and style issues. The existing CI only linted changed lines, so the repository had no clean full-lint baseline.

The dependency graph currently contains two 2-module cycles (`circle`/`unitConverters` and `AirportController`/`AirportModel`) plus one 13-module model/navigation/traffic cycle. Those are explicit architecture debt rather than lint-toolchain work; the Phase 2 flat configuration does not pretend a linter can safely untangle them.

The second Phase 2 slice replaced ESLint 5, Babel-ESLint, and the React-oriented Airbnb graph with ESLint 10, native parsing, and maintained flat configuration. `npm run lint` now checks all 272 maintained JavaScript files in `src/`, `test/`, and `tools/`, plus `eslint.config.js`, with zero errors and zero warnings. The migration removed obsolete suppressions and dead statements without changing the established application test or 278-file build contracts.

At audit time, the asset validator was broken because `@openscope/validator` could not resolve one of its own modules. It was also declared as `latest`, making installs non-reproducible. Phase 0 replaced it with repository-owned validation.

### Dependency security

The inherited npm 11 baseline reported:

- All dependencies: 98 vulnerable packages
  - 14 critical
  - 46 high
  - 29 moderate
  - 9 low
- Production dependencies: 11 vulnerable packages
  - 3 critical
  - 5 high
  - 3 low

The direct vulnerable production dependencies were:

- `handlebars` — critical
- `express` — high
- `lodash` — high

These counts were triage signals rather than proof of exploitability in this application. The production dependencies nevertheless required upgrades before public deployment.

After Phase 1 removed the obsolete build graph, `npm audit` reported 70 vulnerable packages overall (9 critical, 35 high, 18 moderate, and 8 low). The Phase 2 test/coverage slice reduced that to 39, and the lint slice reduced it again to 26.

The final Phase 2 dependency slice upgraded Handlebars to 4.7.9, Express to 4.22.3, and Lodash to 4.18.1 behind build, application, browser, and local-server contracts. It also replaced the abandoned `browser-env`/`window` harness with jsdom 29, upgraded PostCSS to 8.5.28 and Sinon to 22.1.0, and refreshed vulnerable transitive resolutions within their declared ranges. `npm run audit:production` now reports zero vulnerabilities and exits successfully. Full `npm audit` reports one moderately vulnerable development-only Showdown package affected by three advisories, with no fixed release; Showdown receives repository-controlled Markdown during the build rather than user input.

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

- [x] Upgrade Express, Handlebars, and Lodash behind focused compatibility tests.
- [x] Remove unused/deprecated Babel proposal and React packages where no JSX exists.
- [x] Replace AVA 1, NYC 14, and the synthetic browser harness with modern AVA, c8, and jsdom.
- [x] Replace ESLint 5 and `babel-eslint` with current ESLint flat configuration.
- [x] Establish a clean full-repository lint baseline.
- [x] Enable honest coverage collection for all eligible modules and introduce ratcheted thresholds from the resulting baseline.
- [x] Add a provider-neutral, fail-closed production audit command without treating the remaining dev-only advisory as production exposure.

Exit condition: **met for the repository-controlled Phase 2 scope**. Production audit is clean, lint reports zero errors and warnings across 272 maintained JavaScript files, all 115 eligible source modules appear in coverage with enforced floors, and the unchanged application/build/browser contracts pass. CI provider, runner topology, acceptable GitHub Actions usage, and budget remain a separate deferred decision; requiring “green CI” before that decision would contradict the explicit non-goal below.

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

Phase 3 began with `AssetLoader` and `StartupAssetLoader` boundaries injected at the `App` composition root. The airport list, selected/default airport, airline definitions, aircraft definitions, airport guides, autocomplete configuration, tutorial data, changelog, airport definitions, and terrain now load through injected boundaries as standard Promises rather than direct `$.getJSON`/`$.when` or global Deferred calls. The same `AssetLoader` instance flows through `AppController` into `ContentQueue` and, via `InputController`, `AutocompleteController`; the same `ContentQueue` flows into `ChangelogController`, through `UiController` into `TutorialView`, and through `AirportController` into every `AirportModel`. `ContentQueue.addPromise()` is now native-Promise-first while preserving queued-request identity, deduplication, priority promotion, and cleanup. The obsolete Deferred-facing `add()` method and `LoadableContentModel` have been removed. Focused tests characterize transport success and failure, exact error identity, normalized diagnostics and airport paths, selected-airport fallback, named startup payloads, concurrent definition requests, downstream-failure propagation, queue resolution/rejection and cleanup, duplicate-request identity, priority promotion, autocomplete/tutorial/changelog/airport/terrain ingestion and load diagnostics, explicit queue propagation, and uncaught-error reporting without importing the browser composition graph. A shared platform reporter preserves the browser uncaught-error channel without orphaned native rejections. The obsolete global `zlsa.atc.loadAsset` bridge has been removed. Storage migration began with a pure `StorageAdapter` around an injected Web Storage-compatible backend and a browser-free `StartupStorage` service. `App` constructs the shared adapter at the composition root: `StartupStorage` uses it for initial-airport selection, while `AppController` passes it to `ChangelogController` for last-played-version state, through `AirportController` into every `AirportModel` for last-selected-airport state, through `UiController` into `TutorialView` for first-run tutorial state, through `CanvasController` into the `CanvasStageModel` singleton for zoom-level state, and through `AppController` into the `GameController` singleton, which configures its existing `GameOptions` instance for user option state. `CanvasStageModel` no longer reads global `localStorage` at import time; a narrow `initStorage(storageAdapter)` configuration method stores the adapter and rehydrates `#_scale`, and `_storeZoomLevel()` is a safe no-op until that runs. `GameOptions` likewise no longer reads or writes global `localStorage`; a narrow `initStorage(storageAdapter)` method normalizes a nullish adapter to canonical null, retains an exact valid adapter, and rehydrates every known option through the adapter, while `addOption()` reads a value only when configured and `setOptionByName()` persists only when configured (preserving its set-property → build-key → write → analytics → optional-event → return ordering). `GameController.initStorage(storageAdapter)`, called early in `AppController.setupChildren()`, stores canonical null or the exact adapter on the singleton, configures the existing `game.option` instance before any UI/canvas consumer reads a value, and retains the adapter across `destroy()` so rebuilt options stay storage-backed. Focused tests preserve raw backend values, Web Storage write delegation, missing-value behavior (including the legacy property-access `undefined` sentinel), exact ICAO-list matching, lowercase selection, explicit-selection short-circuiting, post-load airport persistence timing, default fallback, strict changelog version comparison, conditional version persistence, tutorial open-before-write ordering, the inherited raw `TimeKeeper.gameTimeInSeconds` value, zoom-level adapter identity/exact key read, null/undefined fallback to numeric `SCALE.DEFAULT`, falsy-but-present raw preservation, exact raw write args, no-adapter write no-op, adapter clearing on reset, omitted-adapter compatibility, configuration-time rehydration, and game-option no-adapter defaults with no global access, adapter identity and init-time rehydration of all known options, exact dynamic key reads, null/undefined default fallback, falsy-present and ordinary raw preservation, exact dynamic key/raw writes, no-adapter write updating/recording/triggering/returning without persistence, write-before-analytics-before-event ordering, nullish adapter normalization, and `GameController` adapter identity/forwarding/rehydration and destroy-time adapter retention without importing the browser composition graph. The `speech` function module no longer reads or writes global `localStorage`; `speech_init(storageAdapter)` normalizes a nullish adapter to canonical null and retains it in module state, reads `STORAGE_KEY.ATC_SPEECH_ENABLED` exactly once through the adapter, and enables speech plus the toggle ACTIVE class only for a raw boolean `true` (preserving the inherited strict comparison that rejects the string `'true'`), while `speech_toggle()` persists the raw boolean through the retained adapter at the original write point—after the state flip, optional synthesis cancel, and class toggle, and before reading `hasClass`/recording analytics—and is a deliberate persistence no-op with no adapter; `AppController.init()` now injects storage and synthesis boundaries via `speech_init(this._storageAdapter, this._speechSynthesisAdapter)`; randomness and analytics boundaries are described below. Focused serial tests cover the exact-key single read, adapter retention observed through toggle persistence, no-adapter default-disabled behavior with no storage access, boolean-true enable-plus-ACTIVE, the string `'true'` disabled characterization, non-true raw values, exact key/raw true and false writes, cancel-on-disable, persistence-after-class-mutation-before-analytics ordering, the OPTIONS/`speech` analytics label, no-adapter non-storage behavior, nullish reinitialization clearing the retained adapter, and the preserved `undefined` return without importing the browser composition graph. The CLEAR system command completes the storage front: `StorageAdapter` gains a `clear()` method that delegates exactly to the backend `clear()` and returns its result verbatim (letting any backend failure propagate unchanged), and `InputController` no longer references global `localStorage`/`location`. A new browser-free `ClearStorageAndReload` platform service owns the exact clear/reload behavior: it normalizes a nullish `storageAdapter` and a nullish `reload` callable to canonical null, and its `execute()` clears storage through the adapter and then invokes the reload callable, each capability guarded independently so a configured reload still runs when storage is omitted and vice versa, preserving the inherited clear-before-reload ordering, exact-error propagation on either failure (reload is skipped when clear throws), and the `undefined` return. `App` defaults a narrow page-reload callable to `() => window.location.reload()` and constructs the `ClearStorageAndReload` service from the shared adapter and that callable, threading the single service identity through `AppController` into `InputController`, where it is retained as a canonical-null-when-omitted optional dependency so older/shorter constructor calls stay free of browser globals; the CLEAR case invokes the service only when configured and otherwise falls through to the safe `undefined` return. Focused tests characterize exact backend-clear delegation and clear-failure error identity, plus the service's clear-before-reload order, `undefined` return, omitted/explicitly-null safe behavior with no global access, independently configured capabilities, clear-failure preventing reload with exact error identity, and reload-failure error identity after one successful clear, exercising the pure service directly without importing the browser composition graph. The complete suite reports 1,551 passing, 17 skipped, and 14 todo tests; all 126 eligible source files appear in coverage, lines/statements are 71.85%, functions are 72.03%, branches are 92.94%, and the 278-file build contract remains green.

Wall-clock acquisition now crosses a pure `ClockAdapter` whose injected `now()` callable is backed by `new Date()` only at the `App` composition root. The same adapter configures the import-time `TimeKeeper` singleton through `initClock()` and flows through `AppController` and `AirportInfoController` into `SimClockController`. Both time consumers use one adapter read per current-time query, preserve the existing millisecond/second and local/Zulu calculations, and return deterministic zero values when unconfigured; reset clears the singleton adapter so browser-free tests and later lifecycle configuration do not leak. Focused tests cover exact adapter return/error identity, singleton configuration and cleanup, one-read millisecond/second values, nullish compatibility, local/Zulu conversion from a single date-like value, and unchanged clock readout formatting without fabricating a global current-time source.

Animation-frame scheduling now crosses a pure `FrameScheduler` whose injected request-frame callable is backed by `(callback) => window.requestAnimationFrame(callback)` only at the `App` composition root. `App` retains the exact scheduler identity and routes its update-loop restart points—the post-load kickoff guarded by `UPDATE`, the per-frame reschedule in `update()`, and the pause-resume restart in `_onPause()`—through `frameScheduler.requestFrame(this.onUpdateHandler)`, preserving where each frame is requested, the bound update handler supplied, the untouched updatePre/update/updatePost ordering and pause guard, and the ignored frame handle (no cancellation or handle storage is introduced). The scheduler references no browser globals, so the browser `requestAnimationFrame` reference now lives only in the `App` constructor default. Focused tests cover exact callback-identity forwarding with no extra arguments, exact frame-handle return, and exact thrown-error identity without importing the browser composition graph.

UI and render delays now cross a pure `DelayScheduler` backed by `(callback, delay) => window.setTimeout(callback, delay)` only at the `App` composition root. The same adapter identity is threaded through `AppController` to `LoadingView`, `CanvasController`, `UiController`, and through `AircraftController` to `StripViewController`. Focused adapter and loading-view tests preserve exact callback/delay forwarding, return and error identity, the inherited 1500 ms loading fade delay, and callback order; diff inspection and the browser smoke gate cover the controller wiring while avoiding coverage distortion from importing the browser-heavy controller graph solely for tiny glue methods. The migrated code preserves the 500 ms initial deep-render delay and lexical instance binding, simulation-time outer UI-log timeout followed by a 10000 ms removal delay, and hidden-strip reveal followed by a 300 ms scroll delay while visible strips still scroll immediately. Omitted delay scheduling safely skips only the delayed effect.

Async error delivery completes the clock/timer front. `createAsyncErrorReporter(delayScheduler)` builds one browser-free callable at the `App` composition root from the same shared `DelayScheduler`; `AppController` threads that exact reporter through `ChangelogController`, `AirportController` into every `AirportModel`, `UiController` into `TutorialView`, and `InputController` into `AutocompleteController`. Calling the reporter schedules exactly one callback at delay zero and deliberately returns `undefined`; the callback throws the exact supplied error object, while a scheduler failure propagates unchanged. Nullish scheduling is a safe no-op, and shorter consumer construction no longer recreates or reaches for a global timer. Existing processing-versus-transport error handling and AirportModel terrain-error wrapping remain unchanged. Focused tests cover callback/delay forwarding, deferred exact-error identity, inherited return behavior, nullish operation, and scheduling failure identity; existing consumer tests continue to characterize their explicit reporter calls. Executable `setTimeout` access is now confined to the `App` composition default.

The randomness front begins with a pure `RandomSource` that delegates fractional, inclusive-integer, and inclusive-real draws to three injected callables. `App` supplies `Math.random` and the existing Lodash integer/floating behavior only at the composition root, then configures the shared general-utility, math-core, and pilot-voice function modules before runtime consumers draw. `choose`, `choose_weight`, `randint`, octal generation, and pilot voice/pitch/rate selection preserve their formulas, draw counts, and draw order. Unconfigured modules are deterministic and browser-free: fractional draws are zero and integer draws return the lower bound. Focused tests cover exact adapter forwarding/return/error identity, deterministic omitted behavior, weighted and unweighted selection, integer formulas, per-digit octal draws, and the three ordered pilot-voice draws without coupling the work to speech synthesis. Class-specific random consumers remain for the next slice.

Class-randomness propagation now threads the exact `RandomSource` from `AppController` into the airline controller/collection/model chain, the `NavigationLibrary` singleton and every `ProcedureModel`, `AircraftController` and its `StripViewController`, and `AirportInfoController`. Airline fleet and all-fleet selection, procedure exit selection, strip CID generation, and generated gust/altimeter values no longer import Lodash random or call `Math.random` directly. Omitted sources select the lower bound or zero fraction deterministically. `NavigationLibrary.initRandomSource()` retains app-level configuration across airport resets while allowing tests to clear it explicitly; probability-based procedure tests were replaced with deterministic sequence assertions. Focused tests cover exact identity propagation, inclusive bounds, deterministic omitted selection, and singleton reset/rebuild retention. Traffic generation is the only remaining executable randomness outside the `App` composition root; the historical commented AirportModel timer remains inert.

Traffic generation completes the randomness front. `SpawnPatternCollection.initRandomSource()` retains the app-level source across airport resets and forwards it by identity into every `SpawnPatternModel`; weighted pre-spawn pattern selection uses inclusive real draws over zero through the total rate. Models use inclusive integer draws for altitude, random delay, and list-index selection, and pass the same source into `buildPreSpawnAircraft()`. The pre-spawn helper chain uses inclusive real draws for varying route intervals and preserves Lodash's overloaded altitude behavior: integral altitude-thousands use integer draws while fractional bounds use real draws. Omitted sources consistently select lower bounds without consulting globals. Focused deterministic tests cover singleton normalization/retention/rebuild, identity propagation, weighted boundary selection, exact integer/real bounds, omitted behavior, and the complete helper chain. Executable `Math.random` and Lodash random now exist only in the `App` composition root; the historical commented AirportModel timer remains inert.

Analytics now crosses a pure `AnalyticsAdapter` around an injected `gtag`-compatible transport. `App` creates that adapter only when `window.gtag` is callable and configures the existing `EventTracker` singleton before `AppController` records its initial-load event. `EventTracker` no longer reads a browser global during import or event recording; it retains the exact adapter identity and preserves event names, underscore payload fields, truthy-only value inclusion, outbound beacon metadata, transport return values, exact thrown errors, and the inherited disabled diagnostic/undefined result when no adapter is configured. Existing consumers remain unchanged behind the singleton rather than acquiring nine new constructor parameters. Focused serial tests cover configuration normalization and cleanup, no-global access, exact normal/outbound payloads, falsy-value omission, return/error identity, disabled diagnostics, and storage/analytics/event ordering. Provider access is confined to the `App` composition root.

Speech synthesis now crosses a pure `SpeechSynthesisAdapter` around an injected synthesis backend and utterance factory. `App` constructs it only when both browser capabilities exist, then threads its exact identity through `AppController` into `speech_init()` alongside storage. The adapter preserves utterance creation followed by language, first matching voice, rate, and pitch assignment, then delegates `speak()` or `cancel()` with verbatim results and exact errors. The speech module retains text assembly, enabled state, preference persistence, toggle class mutation, and analytics ordering but no longer reads `window.speechSynthesis` or constructs a global `SpeechSynthesisUtterance`; omitted synthesis makes speaking/cancelling safe no-ops. Focused tests cover adapter operation/property order, voice selection and no-match behavior, delegation result/error identity, omitted capabilities, exact assembled text/pilot voice forwarding, enabled/configured guards, hostile browser globals, nullish initialization, cancel behavior, and existing persistence/analytics order. Executable Web Speech access is confined to the `App` composition root.

Clipboard writes now cross a pure `ClipboardAdapter` around an injected `writeText` callable. `App` creates it only when the browser clipboard method is callable, using a receiver-preserving wrapper, then threads the exact adapter through `AppController` into `InputController`. Coordinate formatting, asynchronous console-before-UI success logging, exact messages, undefined method return, and synchronous error identity are preserved; omitted adapters and adapters with omitted backends safely skip copying and logging. Page focus and visibility now cross a pure `PageVisibilityAdapter` built from injected window-listener, document-listener, and visibility-state capabilities. `AppController` configures the `GameController` singleton before `init_pre()` enables it. Registration preserves blur, focus, then visibility-change order, direct blur/focus callback identities, one visibility-state read per event, and hidden/visible routing. Missing capabilities produce no partial registration, and the inherited absence of listener teardown remains deliberately unchanged. Focused tests cover exact clipboard text/results/errors, omitted behavior, registration order and callback identities, state routing, singleton normalization and retention, source-less enablement, and coordinate success-log ordering. Executable clipboard and page-visibility access is confined to the `App` composition root. The complete suite reports 1,579 passing, 17 skipped, and 14 todo tests; all 128 eligible source files appear in coverage, lines/statements are 72.75%, functions are 70.67%, branches are 93.03%, and the lint, 278-file build, and KPDX browser-smoke gates pass.

Phase 3 is complete. The repository-owned `npm run core:browser-free` gate starts a fresh Node process without AVA's jsdom bootstrap, removes and verifies the absence of `window`, `document`, `navigator`, and `localStorage`, then imports and exercises all fourteen platform adapters/services plus `ContentQueue`, `EventTracker`, `TimeKeeper`, shared utility/math randomness, startup loading/storage, and the speech facade. The proof exposed one residual `ContentQueue` constructor fallback that created a jQuery-backed `AssetLoader`; the final repair removes that ambient fallback and makes omitted loading reject before mutating queue state. The gate now passes in the pinned Node 24 container without fabricated browser globals, and the executable provider census confines every named platform default to `App`. Final acceptance reports 1,580 passing, 17 skipped, and 14 todo tests; all 128 eligible source files appear in coverage, lines/statements are 72.76%, functions are 70.70%, and branches are 93.03%. Full lint, the deterministic 278-file build, production dependency audit with zero vulnerabilities, and KPDX browser smoke with zero uncaught errors also pass. This satisfies the Phase 3 exit condition while leaving DOM/canvas presentation code and its legitimate browser dependencies for later architectural phases.

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

## Current implementation slice

Phase 4 now has a browser-free `SimulationContext` with context-owned event dispatch, deterministic time, game timers, airport-controller state, navigation/fix state, traffic patterns, and traffic scheduling. Each context creates fresh clock, event-bus, `SimulationTimerQueue`, `AirportControllerClass`, `NavigationLibraryClass`, `FixCollectionClass`, `SpawnPatternCollectionClass`, and `SpawnSchedulerClass` instances by default; `tick(delta)` advances that clock before processing only that session's timers, and `destroy()` clears only that session's observers, timers, airport registry/current selection, navigation state, and traffic patterns. Explicitly injected airport, navigation, and spawn-pattern services are retained by exact identity. Context-created navigation and traffic services receive the context's exact random-source identity, while context-created airport and traffic services retain the session's event, airport, navigation, clock, and timer capabilities.

The navigation checkpoint retains the legacy default `NavigationLibrary` and `FixCollection` singleton exports for unmigrated production consumers while exposing constructible named classes. Airway validation now uses the owning library passed by `NavigationLibraryClass`, removing the inherited `NavigationLibrary`/`AirwayModel` import cycle. Airway- and procedure-generated `WaypointModel` instances resolve positions through that same library's fix collection rather than the global singleton. Focused tests and the fresh-process browser-free proof exercise two independent navigation graphs, airway expansion, context-local destruction, and random-source propagation.

The airport-controller checkpoint likewise retains the legacy default `AirportController` singleton while exposing `AirportControllerClass`. Context-owned controllers isolate their airport registry, current selection, and airport-change publication, retain their injected event bus across reset, and pass the exact bus and owning controller to each `AirportModel`. Airport and terrain load-failure recovery now resolves through the owning controller rather than importing the default singleton, removing the inherited `AirportController`/`AirportModel` cycle. The fresh-process proof creates and selects a real flyweight in one context, verifies the other remains untouched, and confirms local destruction. Production `App` composition remains on the compatibility singleton. `AirportModel.set()` still uses legacy `GameController` and `TimeKeeper`; moving those cross-domain side effects behind context-owned game state and time remains explicit later Phase 4 work rather than being folded into this airport-registry slice.

The traffic checkpoint retains the legacy default `SpawnPatternCollection` and `SpawnScheduler` singleton exports while exposing constructible named classes. Each context owns a fresh pattern collection and scheduler tied to its exact navigation library, airport controller, random source, clock, and timer queue. Spawn-pattern route construction and SID/STAR replacement resolve through the owning navigation graph, scheduler deadlines use context simulation time, and callbacks execute only through that context's timer queue. Two-context tests and the fresh-process browser-free proof exercise isolated pattern state, traffic callback dispatch, and local teardown. The scheduler's aircraft-controller dependency remains deliberately uninitialized until the aircraft-ownership slice; production `App` composition remains on compatibility singletons.

Acceptance reports 1,615 passing, 17 skipped, and 14 todo tests; all 131 eligible source files appear in coverage, lines/statements are 72.92%, functions are 71.29%, branches are 93.08%, and lint, the deterministic 278-file build, KPDX browser smoke, the browser-free proof, and the production audit pass. The browser frame loop remains unchanged.

## Explicit non-goals for the first phases

- No React/Vue/Svelte rewrite.
- No wholesale TypeScript conversion.
- No multiplayer/backend architecture.
- No airport-data format redesign.
- No large simulation refactor before characterization coverage exists.
- No CI provider, runner topology, or GitHub Actions redesign until the project makes that decision separately.

## Sources

[1] https://nodejs.org/en/about/previous-releases — Node.js Releases
