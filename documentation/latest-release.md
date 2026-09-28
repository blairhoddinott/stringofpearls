# String of Pearls releases

String of Pearls ships automated releases. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) derived from
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): every eligible merge to
`master` opens a release-preparation pull request, and merging that pull request publishes a
signed `vX.Y.Z` tag and a matching GitHub Release.

- Full history: [CHANGELOG.md](../CHANGELOG.md)
- All releases: [https://github.com/blairhoddinott/stringofpearls/releases](https://github.com/blairhoddinott/stringofpearls/releases)
- How releases work: [Release automation](releases.md)

## Latest release — v1.6.0 (September 28, 2026)

### Features

- **airports:** add Toronto Pearson CYYZ ([`71dc071`](https://github.com/blairhoddinott/stringofpearls/commit/71dc0715bb49a54b7e35ed74265c9826dd89bd99))

### Bug Fixes

- **release:** recover malformed commit history ([`24419b0`](https://github.com/blairhoddinott/stringofpearls/commit/24419b00a8d3dc48274b3b4effa5d2219a80a7f5))
- **airports:** recognize CYYZ zero-padded runways ([`e347a0e`](https://github.com/blairhoddinott/stringofpearls/commit/e347a0e99fe397a2d6618f872b7f1f90c2a0d0e6))

### Tests & Maintenance

- **dev:** add dev container build and start script ([`0c83151`](https://github.com/blairhoddinott/stringofpearls/commit/0c83151510cd289abf419628f73ed241ed6bd1bf))

[View v1.6.0 on GitHub](https://github.com/blairhoddinott/stringofpearls/releases/tag/v1.6.0)
