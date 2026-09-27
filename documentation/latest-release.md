# String of Pearls releases

String of Pearls ships automated releases. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) derived from
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): every eligible merge to
`master` opens a release-preparation pull request, and merging that pull request publishes a
signed `vX.Y.Z` tag and a matching GitHub Release.

- Full history: [CHANGELOG.md](../CHANGELOG.md)
- All releases: [https://github.com/blairhoddinott/stringofpearls/releases](https://github.com/blairhoddinott/stringofpearls/releases)
- How releases work: [Release automation](releases.md)

## Latest release — v1.4.0 (September 27, 2026)

### Features

- **schedules:** add representative traffic for selectable airports ([`3a9301a`](https://github.com/blairhoddinott/stringofpearls/commit/3a9301ae629da31bc42bba9325b225f19ec063e4))
- **schedules:** enrich KSEA representative profile ([`0d99d7c`](https://github.com/blairhoddinott/stringofpearls/commit/0d99d7cba69ff708bd246573ad1b4d9418354e95))
- **traffic:** compose scheduled shift volume ([`b52dc27`](https://github.com/blairhoddinott/stringofpearls/commit/b52dc27c9824580aab4db18258ea33a266c8b46d))
- **traffic:** map scheduled flights to local patterns ([`9fb5b44`](https://github.com/blairhoddinott/stringofpearls/commit/9fb5b44655d5a5175191d69e1d2462096c9f5b8b))
- **traffic:** add schedule-backed traffic planning ([`009cda4`](https://github.com/blairhoddinott/stringofpearls/commit/009cda4dc3d8e9b65062024e4afc58392d4ed070))
- **traffic:** add historical schedule asset contract ([`0e1b15b`](https://github.com/blairhoddinott/stringofpearls/commit/0e1b15b8bf82d7f14c58532a3fdb1731ddca5ca4))

### Bug Fixes

- **schedules:** balance representative movements ([`ded05a3`](https://github.com/blairhoddinott/stringofpearls/commit/ded05a3e195624231ab3330369002c0275536a16))
- **traffic:** preserve schedules through startup ([`7b0ca36`](https://github.com/blairhoddinott/stringofpearls/commit/7b0ca36b818b14b1ef91e66d977890411adc0b51))

### Documentation

- **traffic:** explain historical schedules ([`5110588`](https://github.com/blairhoddinott/stringofpearls/commit/51105886c0dd65610d8a7e3fae138960d8183e68))

### Tests & Maintenance

- **browser:** cover traffic volume lifecycle ([`c254958`](https://github.com/blairhoddinott/stringofpearls/commit/c254958d512f54ffd201cb4b9ff3638583006896))

[View v1.4.0 on GitHub](https://github.com/blairhoddinott/stringofpearls/releases/tag/v1.4.0)
