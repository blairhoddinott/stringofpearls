# String of Pearls releases

String of Pearls ships automated releases. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) derived from
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): every eligible merge to
`master` opens a release-preparation pull request, and merging that pull request publishes a
signed `vX.Y.Z` tag and a matching GitHub Release.

- Full history: [CHANGELOG.md](../CHANGELOG.md)
- All releases: [https://github.com/blairhoddinott/stringofpearls/releases](https://github.com/blairhoddinott/stringofpearls/releases)
- How releases work: [Release automation](releases.md)

## Latest release — v1.1.0 (September 25, 2026)

### Features

- **weather:** display live airport weather ([`2275b4a`](https://github.com/blairhoddinott/stringofpearls/commit/2275b4a4e037534509aa1403b1717a642637b146))
- **weather:** apply live wind to simulation ([`c526b0f`](https://github.com/blairhoddinott/stringofpearls/commit/c526b0f41d50bcac864d257d5970f357dc9db6bd))
- **weather:** add client weather lifecycle ([`2ab3363`](https://github.com/blairhoddinott/stringofpearls/commit/2ab3363ad51df4ee0f05b91b88bdb723d0d886a0))
- **server:** serve weather from production runtime ([`9c93693`](https://github.com/blairhoddinott/stringofpearls/commit/9c93693a637065262da70bb5c5bccefdd79f584d))
- **weather:** add METAR service backend ([`429db4e`](https://github.com/blairhoddinott/stringofpearls/commit/429db4e6d5a97e10cb4e3abaa6806cf5ecbace94))

### Bug Fixes

- **weather:** align wind direction contract ([`b638b58`](https://github.com/blairhoddinott/stringofpearls/commit/b638b58ad2133af58b128c6b32d1263a2daef41a))

### Documentation

- **weather:** document live METAR behavior ([`5d0ce89`](https://github.com/blairhoddinott/stringofpearls/commit/5d0ce8969833b9f7bf0711bdcafc26fea2af051c))

[View v1.1.0 on GitHub](https://github.com/blairhoddinott/stringofpearls/releases/tag/v1.1.0)
