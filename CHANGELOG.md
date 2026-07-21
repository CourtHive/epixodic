# Changelog

## [2.4.0](https://github.com/CourtHive/epixodic/compare/v2.3.1...v2.4.0) (2026-07-21)


### Features

* **crowd:** accept scoped score-audience token on the /crowd relay ([#279](https://github.com/CourtHive/epixodic/issues/279)) ([bdc8333](https://github.com/CourtHive/epixodic/commit/bdc8333c926a7e4bb3a1a95afa25b5c901a5f0dc))
* **crowd:** relay epixodic scores to /crowd as the launched HiveID scorer ([ed15e37](https://github.com/CourtHive/epixodic/commit/ed15e37ba0b8efcd44e5cab400f37f84ee6e83bd))
* **score-relay:** dual-accept es256 tokens alongside legacy hs256 ([1849062](https://github.com/CourtHive/epixodic/commit/1849062ab23744e8f65096d035501528ef351236))
* **score-relay:** JWT_ACCEPT_HS256=false toggle to drop legacy tokens ([80b6371](https://github.com/CourtHive/epixodic/commit/80b6371f34de27ae4ced82b972f98a1798320006))
* **scoring:** overlay local scores onto the tournament draw with live updates ([a0e4a10](https://github.com/CourtHive/epixodic/commit/a0e4a106925ad7d8bdf2494581ffe48ed636cadd))
* **scoring:** submit final outcome to CFS when authorized ([a0d03d0](https://github.com/CourtHive/epixodic/commit/a0d03d0c5267f8e65f701104162b9427af6824c1))


### Bug Fixes

* **deps:** override brace-expansion to patched versions to clear audit ([0bfc4fa](https://github.com/CourtHive/epixodic/commit/0bfc4fa04e6903d3d86575bb0b67e1db89500e13))
* **deps:** sync score-relay lockfile to tods-competition-factory 6.1.1 ([caec129](https://github.com/CourtHive/epixodic/commit/caec129eed972ea8dcc88c4f4aedb4157e8df960))
* **deps:** update courthive-components to 3.11.0 ([06815e6](https://github.com/CourtHive/epixodic/commit/06815e60acfecf047ba00e2db58bd2a299f245d4))
* **deps:** update dependency courthive-components to v3.8.0 ([#272](https://github.com/CourtHive/epixodic/issues/272)) ([f5da29a](https://github.com/CourtHive/epixodic/commit/f5da29a76f2ab9a7dba9a19a68ef16590d1f7eb1))
* **deps:** update dependency courthive-components to v3.8.2 ([#275](https://github.com/CourtHive/epixodic/issues/275)) ([9057717](https://github.com/CourtHive/epixodic/commit/9057717e2b8e16d462861eeffa2186af15b9dc0c))
* **deps:** update tods-competition-factory to 6.10.0 ([9aa6a75](https://github.com/CourtHive/epixodic/commit/9aa6a759f894fae8b5d335f134c5940fbe8ae87d))
* **deps:** update tods-competition-factory to 6.11.0 ([1ae3c83](https://github.com/CourtHive/epixodic/commit/1ae3c83118335ac4142c22d9f38380ea8cd074b2))
* **deps:** update tods-competition-factory to 6.2.0 ([6f4cf91](https://github.com/CourtHive/epixodic/commit/6f4cf918796ed9153607a283047c8099242ad63c))
* **deps:** update tods-competition-factory to 6.3.0 ([7f8394a](https://github.com/CourtHive/epixodic/commit/7f8394aed0dc77433d77c1674d9552103632e623))
* **deps:** update tods-competition-factory to 6.4.0 ([0d36439](https://github.com/CourtHive/epixodic/commit/0d364398bd57e60d617562e34d94ed0be0653da6))
* **deps:** update tods-competition-factory to 6.5.0 ([4730600](https://github.com/CourtHive/epixodic/commit/4730600a7bf4cc39343463e6e968cb256d95949e))
* **deps:** update tods-competition-factory to 6.6.0 ([98e869d](https://github.com/CourtHive/epixodic/commit/98e869d193d98ddfee808d165b44a25573b05346))
* **deps:** update tods-competition-factory to 6.7.0 ([ec964e7](https://github.com/CourtHive/epixodic/commit/ec964e7fc8f104c9e74a026cb0f49bb11bc45d55))
* filter scheduled matchups by scheduled date and add store/api tests ([dd74e3c](https://github.com/CourtHive/epixodic/commit/dd74e3cd2d3632b1315a1d0cb2ae8a2d4c867f9d))
* re-reject failed requests and set per-request auth header in baseApi ([210e0b7](https://github.com/CourtHive/epixodic/commit/210e0b71c6fe6858f46092822b1d694d4340e14d))

## [2.3.1](https://github.com/CourtHive/epixodic/compare/v2.3.0...v2.3.1) (2026-07-04)


### Bug Fixes

* **crowd:** accept provider-audience tokens at the /crowd handshake ([5fa9fcf](https://github.com/CourtHive/epixodic/commit/5fa9fcfd5bef0d03c3a32be027949053717aea4e))
* **deps:** update dependency courthive-components to v3.4.6 ([1a6e655](https://github.com/CourtHive/epixodic/commit/1a6e6552878dec0f758f97a36778e61328345a35))
* **deps:** update dependency tods-competition-factory to v5.8.0 ([#261](https://github.com/CourtHive/epixodic/issues/261)) ([41c452b](https://github.com/CourtHive/epixodic/commit/41c452b81838f2cec4da8aaf7b6f9b562f9cc102))


### Documentation

* refresh CLAUDE.md for score-relay and crowd-scoring ([c39feaa](https://github.com/CourtHive/epixodic/commit/c39feaa8d8045e03c6653cdd474d496bc905be16))

## [2.3.0](https://github.com/CourtHive/epixodic/compare/v2.2.1...v2.3.0) (2026-06-30)


### Features

* **crowd:** accept provider-audience relay tokens (IONSport) ([f50d970](https://github.com/CourtHive/epixodic/commit/f50d970dc9f7fa39effc8657684f9bfacfa6f542))
* **crowd:** carry email_verified scorer attribution to consumers ([7219b28](https://github.com/CourtHive/epixodic/commit/7219b28ad8dd0607f7d91a873de84c1a67c8ad00))


### Bug Fixes

* **deps:** update dependency courthive-components to v3.4.5 ([15b4f79](https://github.com/CourtHive/epixodic/commit/15b4f79c44767716e04c2b3098880a5f713b3373))
* **deps:** update dependency tods-competition-factory to v5.7.1 ([a188e48](https://github.com/CourtHive/epixodic/commit/a188e48685bc1cc9304161a3b36a3b3b5bd9644a))

## [2.2.1](https://github.com/CourtHive/epixodic/compare/v2.2.0...v2.2.1) (2026-06-28)


### Bug Fixes

* **deps:** update courthive-components to 3.4.4 ([aebbf34](https://github.com/CourtHive/epixodic/commit/aebbf348e13bc9e6fff3f52d67fb694a686ba1e7))
* **deps:** update tods-competition-factory to 5.6.0 ([59bfa18](https://github.com/CourtHive/epixodic/commit/59bfa1840b369974403dc640dd8490eb3b1fc9ff))
* **deps:** update tods-competition-factory to 5.7.0 ([82bead8](https://github.com/CourtHive/epixodic/commit/82bead85056fc4916e68c5b7f890afe723ea0f43))
* **pwa:** stamp SW cache version per build + auto-activate updates ([26828a1](https://github.com/CourtHive/epixodic/commit/26828a13a3e66d10e8342a502a03f715ca20c468))

## [2.2.0](https://github.com/CourtHive/epixodic/compare/v2.1.1...v2.2.0) (2026-06-08)


### Features

* **build:** emit dist/version.json so /epixodic/version.json returns real JSON ([7cab85d](https://github.com/CourtHive/epixodic/commit/7cab85d8d700f9a36209e9a88a81d7978f67db5a))


### Bug Fixes

* **deps:** update tods-competition-factory to 5.3.0 ([d7ed5ef](https://github.com/CourtHive/epixodic/commit/d7ed5ef9634b07f479074bba8d2521d96c472e44))
* **deps:** update tods-competition-factory to 5.4.0 ([d95f282](https://github.com/CourtHive/epixodic/commit/d95f28231aa7e4205315627b864f3bced892a71c))

## [2.1.1](https://github.com/CourtHive/epixodic/compare/v2.1.0...v2.1.1) (2026-06-02)


### Bug Fixes

* **build:** stop pnpm at epixodic root from deleting score-relay lockfile ([28bcffa](https://github.com/CourtHive/epixodic/commit/28bcffa611811c14698268e0ed0f11163e4c0139))


### Documentation

* **readme:** rewrite architecture section for the svelte 5 rewrite ([00a59dc](https://github.com/CourtHive/epixodic/commit/00a59dc7381e2aa058103deec9f52102a1733b60))

## [2.1.0](https://github.com/CourtHive/epixodic/compare/v2.0.5...v2.1.0) (2026-06-01)


### Features

* **crowd:** verify hiveid-aud JWTs + record crowdScoredBy on session (hiveid phase 5) ([ab4244d](https://github.com/CourtHive/epixodic/commit/ab4244dca61a2b7ba994e9ceee720e76a602fe61))
* **score-relay:** IONSport-track auth + ownership + rate-limit + persistence fix ([0f3c4a7](https://github.com/CourtHive/epixodic/commit/0f3c4a75c810a899735df3c21aa44bd2da43edd8))
* **score-relay:** per-user fan-out ceiling + per-IP connect rate limit ([19f2688](https://github.com/CourtHive/epixodic/commit/19f2688834781e33fef2c1ada10358ad9afe35f4))


### Bug Fixes

* **deps:** update dependency courthive-components to v1.10.1 ([413925f](https://github.com/CourtHive/epixodic/commit/413925f660f9f1c35030a62f7bcd49d055e39cae))
* **score-relay:** boot fail-fast on strict-auth-without-secret ([e60baa3](https://github.com/CourtHive/epixodic/commit/e60baa3ee33c06125bb555c68a281cc4c2a3211f))
* **score-relay:** stamp token's tournamentId on score-aud frames + unref intervals ([8933e96](https://github.com/CourtHive/epixodic/commit/8933e966ffdb60946b9b519b8e884ebb6eee76ac))
* **tracker-auth:** accept userId as fallback subject claim ([526a3d8](https://github.com/CourtHive/epixodic/commit/526a3d8dfe6041fa0f73d69825ce85c07585be92))

## [2.0.5](https://github.com/CourtHive/epixodic/compare/v2.0.4...v2.0.5) (2026-05-26)


### Bug Fixes

* **deps:** update dependency courthive-components to v1.10.0 ([711bde9](https://github.com/CourtHive/epixodic/commit/711bde931b1556ebaa217918ff7ac06df282dbf4))
* **deps:** update dependency courthive-components to v1.10.0 ([0d45eb9](https://github.com/CourtHive/epixodic/commit/0d45eb9c970e772bd4696f02aaa16163efd591f1))
* **deps:** update dependency tods-competition-factory to v4.2.0 ([c1a8152](https://github.com/CourtHive/epixodic/commit/c1a8152703829ad4c63438b19e8fd0b9d6d2a675))
* **deps:** update dependency tods-competition-factory to v4.2.0 ([42dc698](https://github.com/CourtHive/epixodic/commit/42dc6988671993220be2bba0a1341d9a65a16963))

## [2.0.4](https://github.com/CourtHive/epixodic/compare/v2.0.3...v2.0.4) (2026-05-21)


### Bug Fixes

* **deps:** update dependency courthive-components to v1.7.0 ([99032af](https://github.com/CourtHive/epixodic/commit/99032af12765fbb2e68147591dcdf38c0c4cd263))
* **deps:** update dependency courthive-components to v1.7.1 ([b5e7015](https://github.com/CourtHive/epixodic/commit/b5e7015484954830ecf5692559dbfcb8e9fcd853))
* **deps:** update dependency tods-competition-factory to v4.0.0 ([1743c6b](https://github.com/CourtHive/epixodic/commit/1743c6b84100bf43e7364755673664058516f936))

## [2.0.3](https://github.com/CourtHive/epixodic/compare/v2.0.2...v2.0.3) (2026-05-19)


### Bug Fixes

* **deps:** update dependency courthive-components to v1.6.0 ([86a22c3](https://github.com/CourtHive/epixodic/commit/86a22c37c9c3d6b73b4bbd44473375255f718831))
* **deps:** update dependency tods-competition-factory to v3.7.0 ([f3a51b5](https://github.com/CourtHive/epixodic/commit/f3a51b5a6647a16d198a2f6199789a315598c613))
* **deps:** update dependency tods-competition-factory to v3.8.0 ([d6cc765](https://github.com/CourtHive/epixodic/commit/d6cc765f55b344d77164ea78f2cf6fa0a594eb28))
* **deps:** update dependency tods-competition-factory to v3.9.0 ([60e0b83](https://github.com/CourtHive/epixodic/commit/60e0b83f5c1da4717ce669ba6636999ff7f38bbe))
