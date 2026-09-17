[node]: https://nodejs.org/
[ava]: https://github.com/avajs/ava
[c8]: https://github.com/bcoe/c8
[express]: https://expressjs.com/

# Development tools

The repository targets Node.js 24 and npm 11. The exact versions used by the pinned container are recorded in `.nvmrc` and `package.json`; no global build tools are required.

## Installation

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

`npm ci` consumes the npm 11 lockfile exactly. Direct dependencies remain pinned to exact versions. Remaining install warnings belong to the inherited browser-emulation, test-double, and application dependency graph; do not "fix" them with an unreviewed forced audit upgrade.

## Source and generated output

- `assets/` contains source aviation data, fonts, images, tutorial content, and autocomplete configuration.
- `documentation/airport-guides/` contains Markdown airport guides.
- `src/assets/scripts/client/` contains browser application source.
- `src/assets/scripts/server/` contains the development-only Express server.
- `src/assets/style/` contains LESS source.
- `src/index.hbs` and `src/templates/` contain page templates.
- `public/` is generated and ignored by Git. Never edit it directly.
- `tools/build.js` is the build entry point.
- `tools/build.test.js` is the generated-output contract test.

The build retains the historical public URL layout:

```text
public/
├── index.html
└── assets/
    ├── aircraft/aircraft.json
    ├── airlines/airlines.json
    ├── airports/
    ├── autocomplete/
    ├── fonts/
    ├── guides/guides.json
    ├── images/
    ├── scripts/client/bundle.min.js
    ├── scripts/server/index.js
    ├── style/main.min.css
    ├── tutorial/
    └── changelog.json
```

The Node build uses `fs/promises` for filesystem operations, esbuild for the browser bundle, Less/PostCSS/Autoprefixer/CleanCSS for styles, Handlebars for markup, and Showdown for Markdown conversion. Builds are process-serialized with the kernel-backed `flock` command supplied by util-linux. `flock --no-fork` executes the actual Node build worker while retaining the lock, and the worker verifies its inherited descriptor and `/proc/locks` ownership before touching staging output. The ignored `.public-build.lock` pathname may persist between builds, but ownership exists only while the kernel advisory lock is held, so a killed worker cannot continue building after releasing its lock. Each build writes to an isolated staging directory. Source/compile failures leave the previous `public/` intact; publication failures roll it back, and a simultaneous promotion/rollback failure reports the recoverable backup path for restoration on the next build. Backup-cleanup failures are warnings after successful publication rather than false build failures. Errors no longer escape through unawaited callbacks, which was a charming feature of the old tasks.

Native build and watch commands require Linux, `/proc`, and util-linux `flock`. Those prerequisites are present in the supported Node 24 container. On macOS or Windows, run the commands through the documented container workflow rather than invoking the build natively.

Set `SOURCE_DATE_EPOCH` to a Unix timestamp to make the build timestamp reproducible:

```sh
SOURCE_DATE_EPOCH=0 npm run build
```

## Commands

```sh
npm run build          # production bundle and static output
npm run build:dev      # readable development bundle at the same URLs
npm run build:test     # 278-file URL, data, source-map, and determinism contract
npm run watch          # rebuild all source/data/template inputs on change
npm run start          # serve the generated public/ directory on port 3003
npm run validator:test # validator fixture tests
npm run validate:assets
npm run docker:smoke
npm run browser:smoke
```

`npm run watch` rebuilds the complete output tree when client/server code, styles, templates, source assets, airport guides, the changelog, or package metadata changes. Run `npm run start` in a second terminal to serve it.

## Unit, coverage, and lint gates

The application tests use [AVA 6][ava] with Babel 7 register on Node 24:

```sh
npm test
```

The current Phase 5 baseline reports 1,717 passing, 17 skipped, and 14 todo tests. [c8][c8] provides Node 24 coverage:

```sh
npm run test:coverage
```

Coverage runs with `all: true`, verifies that all 139 eligible source modules appear under their real repository paths, and enforces regression floors of 68% statements/lines, 70% functions, and 90% branches. The current Phase 5 baseline measures 79.88% statements/lines, 73.65% functions, and 91.95% branches. Historical checkpoints remain recorded in the modernization audit. Generated reports are written to `coverage/`.

`npm run lint` uses ESLint 10 flat configuration and currently checks 333 JavaScript files across `src/`, `test/`, and `tools/`, including the lint configuration itself. The gate has a clean baseline with zero errors and zero warnings. Remaining dependency cycles are documented architecture debt and are intentionally outside this toolchain slice.

The generated application may also be served by the inherited [Express][express] server for local development. `npm run server:test` builds the application and verifies root/static-asset responses, missing paths, encoded traversal rejection, and clean server shutdown. Production uses the unprivileged NGINX runtime described in [`documentation/development/containers.md`](../documentation/development/containers.md).

`npm run audit:production` is the fail-closed dependency-security gate. The Phase 2 baseline is zero production vulnerabilities. A full `npm audit` retains one moderately vulnerable Showdown package affected by three advisories, with no fixed release; Showdown processes repository-controlled Markdown during builds and is not exposed to user input.
