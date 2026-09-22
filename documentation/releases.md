# Release process and versioning

String of Pearls versions its releases independently of its openScope ancestry.
This page describes the versioning policy, how the next version and changelog are
derived from commit history, and the intended release pull-request lifecycle.

> **Status:** the release preparation and publication tooling and its workflow
> are implemented and tested, but the separately registered signing runner,
> isolated keyring, and `RELEASE_AUTOMATION_TOKEN` are **not yet configured**.
> Until those operator steps are completed after merge, no release is produced
> automatically and nothing is tagged or published. The commands below can be
> run locally to preview or generate release files.

## Independent SemVer 1.x policy

String of Pearls follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
on its own line, starting at **`1.0.0`**. The inherited `6.x` openScope version
numbers are historical only; they are preserved in [CHANGELOG.md](../CHANGELOG.md)
for attribution and are never bumped again.

- The **bootstrap** release is forced to `1.0.0` regardless of commit history.
- Every release after that is a normal SemVer bump computed from the commits
  since the previous release.

## Commit bump rules

The next version is derived from [Conventional Commits](https://www.conventionalcommits.org/)
merged since the last release. The highest-ranked change wins:

| Commit                                             | Bump    |
| -------------------------------------------------- | ------- |
| `feat: …`                                          | minor   |
| `fix: …` / `perf: …`                               | patch   |
| any type with `!` or a `BREAKING CHANGE:` footer   | major   |
| `docs`, `refactor`, `ci`, `build`, `test`, `chore` | none    |

If no commit demands a bump, there is **nothing to release** and no files change.

Merge commits and previously generated `chore(release): …` commits are ignored. After the `1.0.0` bootstrap, any non-excluded commit whose subject is **not** a well-formed Conventional Commit fails preparation closed—the tooling never guesses. The bootstrap alone preserves pre-policy continuation commits under **Other Changes**, so the modernization history is not discarded.

## Generated changelog categories

The generated release body groups commits into these sections, in this order,
omitting any that are empty:

1. **Breaking Changes**
2. **Features** (`feat`)
3. **Bug Fixes** (`fix`)
4. **Performance** (`perf`)
5. **Documentation** (`docs`)
6. **Refactoring** (`refactor`)
7. **CI & Build** (`ci`, `build`)
8. **Tests & Maintenance** (`test`, `chore`)
9. **Other Changes** (well-formed but unrecognized types)

The same body is inserted into [CHANGELOG.md](../CHANGELOG.md) as a
`## [X.Y.Z] - YYYY-MM-DD` section and rendered into the generated
[latest-release summary](latest-release.md). Dates are deterministic: they come
from `RELEASE_DATE` or `SOURCE_DATE_EPOCH`, never a hidden wall clock.

## Release pull-request lifecycle

A preparation run validates all output before writing these four artifacts as one required set:

- `package.json` and `package-lock.json` version bumps,
- a new `CHANGELOG.md` section,
- the regenerated `documentation/latest-release.md` summary.

These land on a branch named **`chore/release-vX.Y.Z`** as a single commit with
the message **`chore(release): vX.Y.Z`**. The intended lifecycle (once the
workflow is live) is:

1. An eligible merge to `master` triggers a preparation run.
2. The run opens a release pull request from `chore/release-vX.Y.Z`.
3. The release PR is merged with a normal two-parent merge commit; squash and
   rebase merges are deliberately rejected for release PRs.
4. Automation verifies the trusted PR head signature, exact four-file diff,
   version, changelog body, and date before publishing the `vX.Y.Z` tag and a
   matching GitHub Release. It reads the remote tag back and requires both its
   annotated-tag object and peeled commit to match the locally verified signed
   tag before the GitHub Release may be created.

Releases are serialized: only one `chore/release-vX.Y.Z` pull request may be
open. A later eligible merge fails closed until that release PR is merged or
closed, rather than silently folding multiple merges into one version.
Stale push events and workflow reruns are rejected; the triggering SHA must still
be the current `master` tip.

The generated commit and annotated tag are signed with Balder's dedicated key
and verified locally against fingerprint
`55752C968BC2E769D973F65727D0742393C6CAA3` before publication. See
[Local GitHub Actions runner](development/self-hosted-runner.md#7-configure-the-privileged-release-runner)
for the isolated signing-runner and token setup.

Preview or generate the release commit locally:

```sh
RELEASE_DATE=2026-09-22 npm run release:check -- --baseline v1.2.3
RELEASE_DATE=2026-09-22 npm run release:prepare -- --baseline v1.2.3
npm run release:test
```

Use the intended release date; the tools refuse an implicit wall clock. The first release instead uses `--bootstrap --baseline 485a4c74942ed003ec0ea973e14cbc3cc50bbd2c`. Both preparation commands refuse a dirty working tree.

## Superseded procedure

This process replaces the sprint-based openScope release procedure in
[development-processes-checklists.md](development-processes-checklists.md), which
is retained for historical reference only.
