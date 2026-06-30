# Changelog

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
