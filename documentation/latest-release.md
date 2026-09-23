# String of Pearls releases

String of Pearls ships automated releases. Versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) derived from
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): every eligible merge to
`master` opens a release-preparation pull request, and merging that pull request publishes a
signed `vX.Y.Z` tag and a matching GitHub Release.

- Full history: [CHANGELOG.md](../CHANGELOG.md)
- All releases: [https://github.com/blairhoddinott/stringofpearls/releases](https://github.com/blairhoddinott/stringofpearls/releases)
- How releases work: [Release automation](releases.md)

## Latest release — v1.0.0 (September 23, 2026)

### Features

- **release:** automate semver changelog publishing ([`45662ec`](https://github.com/blairhoddinott/stringofpearls/commit/45662ec47e0e11a5cd4b998f5feb9e21eac50a8f))
- **traffic:** add traffic mode selection ([`4d82093`](https://github.com/blairhoddinott/stringofpearls/commit/4d820931882cb29ab3338724073ca6c62f52c4b5))

### Bug Fixes

- **release:** write generated bootstrap artifacts ([`5b63ebe`](https://github.com/blairhoddinott/stringofpearls/commit/5b63ebe99a3dd5233ebcfeda33a6fba171c6ab86))
- **ci:** isolate required acceptance context ([`a3be41f`](https://github.com/blairhoddinott/stringofpearls/commit/a3be41fea2307bc553364009da325bd3452a20eb))
- **container:** set nginx config read permissions ([`b204f4b`](https://github.com/blairhoddinott/stringofpearls/commit/b204f4bc78a5a643ee6511df96ebffedfdde381c))
- **ci:** preserve failed smoke container diagnostics ([`f840ee3`](https://github.com/blairhoddinott/stringofpearls/commit/f840ee31081e15181acc30ab69093aef7d06fd56))
- **traffic:** match flight strips to selected mode ([`9d4d61b`](https://github.com/blairhoddinott/stringofpearls/commit/9d4d61b1ac0b6cbb66e4b23b9e9279138a7481c2))

### Documentation

- **traffic:** document mode selection behavior ([`5e42b47`](https://github.com/blairhoddinott/stringofpearls/commit/5e42b47efa31e1763019fd86beb46aad4b542f97))
- rebrand project and publish roadmap ([`1019d85`](https://github.com/blairhoddinott/stringofpearls/commit/1019d85bd6b27c59c461f1760fd9b9678c7294f3))
- organize modernization audit ([`7dafa06`](https://github.com/blairhoddinott/stringofpearls/commit/7dafa06e28035f04de54d85377782cd6b218fa9c))
- add modernization audit and roadmap ([`a0e5fa9`](https://github.com/blairhoddinott/stringofpearls/commit/a0e5fa9f364b088ea29420605e4961ad46a20343))

### Refactoring

- isolate airport controller state ([`8bc9a57`](https://github.com/blairhoddinott/stringofpearls/commit/8bc9a578c1efdb29174e3c16a6f41897f1408a69))
- isolate navigation state by simulation ([`9b02c80`](https://github.com/blairhoddinott/stringofpearls/commit/9b02c809c778e04443e93de4acf109ccd935cbf2))
- move game timers into simulation context ([`169efc1`](https://github.com/blairhoddinott/stringofpearls/commit/169efc137930c46d6cd712a850fbf5f656f58faa))
- define simulation clock policy ([`f62f261`](https://github.com/blairhoddinott/stringofpearls/commit/f62f26136f5306b7f5e8aab58350123f390d5c63))
- add deterministic simulation clock ([`e1dd87a`](https://github.com/blairhoddinott/stringofpearls/commit/e1dd87a29122700b55ffa69628bd2f1bf289e52d))
- introduce simulation context ([`bf0c867`](https://github.com/blairhoddinott/stringofpearls/commit/bf0c867a060b7e74e3c4725b097f69ca0123be72))
- isolate clipboard and page visibility ([`4e639ed`](https://github.com/blairhoddinott/stringofpearls/commit/4e639ed6587d2c8cbd1b15da07509dc25610d4ff))
- introduce speech synthesis boundary ([`ab830e6`](https://github.com/blairhoddinott/stringofpearls/commit/ab830e653d27b198d48bf50b25389093ae4319d8))
- introduce analytics boundary ([`523a04b`](https://github.com/blairhoddinott/stringofpearls/commit/523a04bb6a44a2be772fd5ce2fda97a657dd84f0))
- complete randomness boundary ([`ee71bbb`](https://github.com/blairhoddinott/stringofpearls/commit/ee71bbbcfb01f0447858b6539167de7eb7a2009d))
- migrate class randomness consumers ([`ee6d6bd`](https://github.com/blairhoddinott/stringofpearls/commit/ee6d6bd0ba42eb9540fb6a642472a3a795073df5))
- introduce shared randomness boundary ([`48a2aac`](https://github.com/blairhoddinott/stringofpearls/commit/48a2aac569e245c8df18fd767bd652d662cc44fe))
- complete clock and timer boundaries ([`f65f431`](https://github.com/blairhoddinott/stringofpearls/commit/f65f4313982547652d1897cc55d4ee43ec6fdeed))
- migrate ui delay scheduling ([`900cb21`](https://github.com/blairhoddinott/stringofpearls/commit/900cb21085f54b08857c4e854cc4de7b9f77b2d2))
- introduce frame scheduling boundary ([`c03b3ef`](https://github.com/blairhoddinott/stringofpearls/commit/c03b3efbdc839b102899c32b9cf3c5dcc17a3877))
- introduce wall clock boundary ([`63913b9`](https://github.com/blairhoddinott/stringofpearls/commit/63913b99a63a10df6c748d46d14a573219119d6a))
- complete storage boundary migration ([`d6af0cb`](https://github.com/blairhoddinott/stringofpearls/commit/d6af0cb1a6686319d4b226ec7805fe550bffcf24))
- migrate speech preference storage ([`8db73a5`](https://github.com/blairhoddinott/stringofpearls/commit/8db73a58507f296201642f2c92b861be8cf0ed5e))
- migrate game options storage ([`6d36a8d`](https://github.com/blairhoddinott/stringofpearls/commit/6d36a8dd0f5495ff53228c000280b8392d9aed1c))
- migrate canvas zoom storage ([`d4ce465`](https://github.com/blairhoddinott/stringofpearls/commit/d4ce465e74c2fd7e72a2f33dbba7808a7a6aaccf))
- migrate tutorial storage ([`d73a6c7`](https://github.com/blairhoddinott/stringofpearls/commit/d73a6c7ba82058581729d9b7824862ba698c0039))
- migrate airport storage ([`1fdb23e`](https://github.com/blairhoddinott/stringofpearls/commit/1fdb23e351219b83c16a8c76ab9b43d8c289df85))
- migrate changelog storage ([`1d2718b`](https://github.com/blairhoddinott/stringofpearls/commit/1d2718b96ecdd362dffe749a00b218ddb5383c86))
- introduce startup storage boundary ([`ec8c559`](https://github.com/blairhoddinott/stringofpearls/commit/ec8c559424b6536c4779e9f721e0f63f6c960fca))
- remove deferred asset queue ([`dd0face`](https://github.com/blairhoddinott/stringofpearls/commit/dd0face54033654aa4d5285792aeaecc8935c285))
- migrate airport asset loading ([`c1703c8`](https://github.com/blairhoddinott/stringofpearls/commit/c1703c8fa2c89eab35a1c4a0011da4ca7ec53f6a))
- migrate tutorial asset loading ([`f772498`](https://github.com/blairhoddinott/stringofpearls/commit/f772498bf989592237c6ec43256193a4cf9f3d67))
- inject autocomplete asset loader ([`e16df38`](https://github.com/blairhoddinott/stringofpearls/commit/e16df389f386aec67963b4f89bf207d154adf9bf))
- route content queue through asset loader ([`e7538ba`](https://github.com/blairhoddinott/stringofpearls/commit/e7538ba665b3f3f330c4eec52f2e41b1dbf1fd15))
- introduce startup asset boundaries ([`59a0f2f`](https://github.com/blairhoddinott/stringofpearls/commit/59a0f2f02faf0208e8bd774603fcd79399d14914))

### CI & Build

- **actions:** require acceptance before merge ([`457f48a`](https://github.com/blairhoddinott/stringofpearls/commit/457f48a59d70bcf17c291531f8953ccc41064116))
- **actions:** use local self-hosted runner ([`d816ae5`](https://github.com/blairhoddinott/stringofpearls/commit/d816ae51f29082fbfe4b47a7408dc73ec426c638))
- modernize Phase 1 toolchain ([`8fd01bf`](https://github.com/blairhoddinott/stringofpearls/commit/8fd01bfa19d0252e8b1e4176c58673972e983227))

### Tests & Maintenance

- prove Phase 3 browser isolation ([`85f1025`](https://github.com/blairhoddinott/stringofpearls/commit/85f102563faa77f2dbbd742a1ed4b2f13b3d3fb1))
- modernize Node 24 coverage stack ([`edea5e7`](https://github.com/blairhoddinott/stringofpearls/commit/edea5e785f3b91699bc98e637732b0197949a735))

### Other Changes

- Update README for completed modernization ([`f50c0d9`](https://github.com/blairhoddinott/stringofpearls/commit/f50c0d94f69dee6d3f1788d8e562e68d9232c45a))
- Complete Phase 5 architecture modernization ([`b6936af`](https://github.com/blairhoddinott/stringofpearls/commit/b6936afceb4bc82c211b0b5202c4b6b4c8eb95e2))
- Extract keyboard input interaction ([`44d1254`](https://github.com/blairhoddinott/stringofpearls/commit/44d1254c317032da58c661c0bcfba23af5494e3c))
- Extract viewport gesture interaction ([`743bb35`](https://github.com/blairhoddinott/stringofpearls/commit/743bb3584df81ec52b3f04c1a9b9ef9b28916f87))
- Extract command input interaction ([`47894cf`](https://github.com/blairhoddinott/stringofpearls/commit/47894cf4b79ec34e9e178957cbaa1148736add72))
- Extract aircraft selection interaction ([`0ed1718`](https://github.com/blairhoddinott/stringofpearls/commit/0ed17188c3bbf8195286c8c3a31774212a561401))
- Extract measurement input interaction ([`7b6471d`](https://github.com/blairhoddinott/stringofpearls/commit/7b6471d2cd895e535feddb37345fcc6b5498bdd1))
- Extract browser input event bindings ([`fb0bced`](https://github.com/blairhoddinott/stringofpearls/commit/fb0bced8f93b15e507cc3a084f06d67af296fe0f))
- Extract aircraft annotation renderer ([`2df8c9a`](https://github.com/blairhoddinott/stringofpearls/commit/2df8c9a0f4779c13d9cc182774bcc24bd46d3025))
- Extract aircraft target renderer ([`9552832`](https://github.com/blairhoddinott/stringofpearls/commit/95528324e9942f41d5529fe919a43ed19214527a))
- Extract measurement overlay renderer ([`541bfc2`](https://github.com/blairhoddinott/stringofpearls/commit/541bfc2f84263f775260053e13fc0cf364ea2e8b))
- Extract airport background renderer ([`a3f8b4d`](https://github.com/blairhoddinott/stringofpearls/commit/a3f8b4d4abbb50d853f2f1759dbc2b3d99281425))
- Extract airport navigation renderer ([`a66632e`](https://github.com/blairhoddinott/stringofpearls/commit/a66632ea80fe7f93b9688b6513b445a0920d64f5))
- Extract airport runway renderer ([`0942056`](https://github.com/blairhoddinott/stringofpearls/commit/09420566db3280b4f04e54d87dfb93439839395b))
- Extract canvas viewport ownership ([`ee90622`](https://github.com/blairhoddinott/stringofpearls/commit/ee906225bc1922084f3ecf8549719bc299f1620b))
- Extract browser canvas host ([`9358860`](https://github.com/blairhoddinott/stringofpearls/commit/935886076c690176cca4845a6b30ab5df88cf528))
- Extract canvas render scheduling ([`9a89e4b`](https://github.com/blairhoddinott/stringofpearls/commit/9a89e4ba94a87c8a2be5e74ceb90c5467c22552a))
- Update documentation for completed Phase 4 ([`021ba1f`](https://github.com/blairhoddinott/stringofpearls/commit/021ba1f4a21523bdb6840faf5abf9246bc465fb4))
- Complete deterministic simulation context isolation ([`ccade03`](https://github.com/blairhoddinott/stringofpearls/commit/ccade03108be86bbd87743eb047ef34c32faccf8))
- Own score and simulation options per context ([`c2c7109`](https://github.com/blairhoddinott/stringofpearls/commit/c2c710911d6c2f941af496786f61153c25c8b339))
- Advance aircraft through simulation context ticks ([`2fbce8c`](https://github.com/blairhoddinott/stringofpearls/commit/2fbce8c01a55e7070c9662c666af9c65a5080809))
- Bind aircraft construction to simulation owners ([`01c8101`](https://github.com/blairhoddinott/stringofpearls/commit/01c810131916532efbe74aa353909a402615708f))
- Own aircraft collection state per simulation context ([`ae10f97`](https://github.com/blairhoddinott/stringofpearls/commit/ae10f97b690ea4c918d19fd439efe1ea1da44b13))
- Own traffic scheduling per simulation context ([`c23b5d4`](https://github.com/blairhoddinott/stringofpearls/commit/c23b5d47356f0f28596b6241b3888bb2eec5227b))
- [verified] security: complete Phase 2 modernization ([`21ef59b`](https://github.com/blairhoddinott/stringofpearls/commit/21ef59be4177fc4056345d065e5c054098311417))
- modernize full-repository static analysis ([`888f7cd`](https://github.com/blairhoddinott/stringofpearls/commit/888f7cd4635a2f64ac61bf64e1db12fe5f5a0056))
- [verified] fix: make build worker own publication lock ([`a04f314`](https://github.com/blairhoddinott/stringofpearls/commit/a04f3140f4fff666644f690cfc51522c1ec93702))
- [verified] build: establish Phase 0 baseline ([`6a3ec55`](https://github.com/blairhoddinott/stringofpearls/commit/6a3ec5521d4f2b942ae39c868e3783cb8abf80f4))
- [verified] build: dockerize application ([`20abec2`](https://github.com/blairhoddinott/stringofpearls/commit/20abec245f058f3cce8ee6e82fc6cf4b1a860f46))
- added roadmap ([`84bf81e`](https://github.com/blairhoddinott/stringofpearls/commit/84bf81ebc74dd0674451f12c27aaecd1e0cf472c))

[View v1.0.0 on GitHub](https://github.com/blairhoddinott/stringofpearls/releases/tag/v1.0.0)
