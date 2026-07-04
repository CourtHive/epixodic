# Changelog

## [0.3.1](https://github.com/CourtHive/epixodic/compare/score-relay-v0.3.0...score-relay-v0.3.1) (2026-07-04)


### Bug Fixes

* **crowd:** accept provider-audience tokens at the /crowd handshake ([5fa9fcf](https://github.com/CourtHive/epixodic/commit/5fa9fcfd5bef0d03c3a32be027949053717aea4e))
* **deps:** update dependency tods-competition-factory to v5.8.0 ([#261](https://github.com/CourtHive/epixodic/issues/261)) ([41c452b](https://github.com/CourtHive/epixodic/commit/41c452b81838f2cec4da8aaf7b6f9b562f9cc102))

## [0.3.0](https://github.com/CourtHive/epixodic/compare/score-relay-v0.2.1...score-relay-v0.3.0) (2026-06-30)


### Features

* **crowd:** accept provider-audience relay tokens (IONSport) ([f50d970](https://github.com/CourtHive/epixodic/commit/f50d970dc9f7fa39effc8657684f9bfacfa6f542))
* **crowd:** carry email_verified scorer attribution to consumers ([7219b28](https://github.com/CourtHive/epixodic/commit/7219b28ad8dd0607f7d91a873de84c1a67c8ad00))


### Bug Fixes

* **deps:** update dependency tods-competition-factory to v5.7.1 ([a188e48](https://github.com/CourtHive/epixodic/commit/a188e48685bc1cc9304161a3b36a3b3b5bd9644a))

## [0.2.1](https://github.com/CourtHive/epixodic/compare/score-relay-v0.2.0...score-relay-v0.2.1) (2026-06-28)


### Bug Fixes

* **deps:** update tods-competition-factory to 5.6.0 ([59bfa18](https://github.com/CourtHive/epixodic/commit/59bfa1840b369974403dc640dd8490eb3b1fc9ff))
* **deps:** update tods-competition-factory to 5.7.0 ([82bead8](https://github.com/CourtHive/epixodic/commit/82bead85056fc4916e68c5b7f890afe723ea0f43))

## [0.2.0](https://github.com/CourtHive/epixodic/compare/score-relay-v0.1.0...score-relay-v0.2.0) (2026-06-08)


### Features

* :construction: server broadcasting ([4f42d15](https://github.com/CourtHive/epixodic/commit/4f42d156694269d3eb6006cddff00c705dac487c))
* add INTENNSE Bolt scoring interface ([c64ca73](https://github.com/CourtHive/epixodic/commit/c64ca73000b11353338b1e82f7a63214112078ac))
* bolt-history client integration, score-relay projection intake, BoltScoringPage hydration ([e291af4](https://github.com/CourtHive/epixodic/commit/e291af461b0a79f9778a6742dee8af2af5d9e7a5))
* **crowd:** verify hiveid-aud JWTs + record crowdScoredBy on session (hiveid phase 5) ([ab4244d](https://github.com/CourtHive/epixodic/commit/ab4244dca61a2b7ba994e9ceee720e76a602fe61))
* rally counter, serve clock relay sync, UI polish + rulebook audit ([3dd99a1](https://github.com/CourtHive/epixodic/commit/3dd99a1b250fa7d8adbf46fc407fd583e3a791a2))
* **relay:** clockSync event for pause/resume/break/timeout transitions ([317d78a](https://github.com/CourtHive/epixodic/commit/317d78a6710f6ad1d82328c3ee9d93b63f47a659))
* **relay:** relay-native clock ticks — no server involvement ([5eec29d](https://github.com/CourtHive/epixodic/commit/5eec29db5d309d74e31d834baa0c27597228a1f3))
* **relay:** snapshot penalty box state into BoltHistoryDocument ([8216cb1](https://github.com/CourtHive/epixodic/commit/8216cb17f700ce69cec2a51e8d8d6163c1c24473))
* **relay:** terminal scorebug client for relay feed verification ([9d31559](https://github.com/CourtHive/epixodic/commit/9d31559769a419a6c601103b1f6612510359c33e))
* **relay:** tick timeout + break clocks for scorebug/video boards ([d202447](https://github.com/CourtHive/epixodic/commit/d20244703954fec9cb1618ccb36013b4ca94276a))
* score relay integration, scoring modal, and archive UX improvements ([780a1b3](https://github.com/CourtHive/epixodic/commit/780a1b3efea2e9342b62de8859a8c67967ac0c54))
* **score-relay:** /crowd Socket.IO namespace + JWT + rate limits (Phase 3 slice 2) ([e711361](https://github.com/CourtHive/epixodic/commit/e711361592840b9fb138068771a3b6903ab4b517))
* **score-relay:** crowd inactivity scheduler (Phase 3 slice 5) ([f810948](https://github.com/CourtHive/epixodic/commit/f810948541dce4cff34255eb605f8d97fc174abf))
* **score-relay:** crowd REST API for TMX (Phase 3 slice 3) ([7c3e173](https://github.com/CourtHive/epixodic/commit/7c3e173cbda15e3758ccda643869f07c69748524))
* **score-relay:** crowd-scoring storage foundation (Phase 3 slice 1) ([23b0a6e](https://github.com/CourtHive/epixodic/commit/23b0a6e1475fa07f9b7018413614e85fb82f0c9f))
* **score-relay:** internal matchUp-finalized webhook receiver (Phase 3 slice 4) ([d3d91c0](https://github.com/CourtHive/epixodic/commit/d3d91c0e491db5ce0530d21fc4ea30af39c0419d))
* **score-relay:** IONSport-track auth + ownership + rate-limit + persistence fix ([0f3c4a7](https://github.com/CourtHive/epixodic/commit/0f3c4a75c810a899735df3c21aa44bd2da43edd8))
* **score-relay:** per-user fan-out ceiling + per-IP connect rate limit ([19f2688](https://github.com/CourtHive/epixodic/commit/19f2688834781e33fef2c1ada10358ad9afe35f4))
* **score-relay:** upstream relay federation ([a334092](https://github.com/CourtHive/epixodic/commit/a334092ce2870e9ea53516b6c5de154f1e3bf8a1))
* tournament subscriptions in score relay, archive UX fixes ([6055bbd](https://github.com/CourtHive/epixodic/commit/6055bbd916faeb1fc68d2e58f16c0e510fe0530b))


### Bug Fixes

* **deps:** update dependency tods-competition-factory to v3 ([da13ae7](https://github.com/CourtHive/epixodic/commit/da13ae7206f29240d34ba1201e2f8268d44bb8e5))
* **deps:** update dependency tods-competition-factory to v3.7.0 ([f3a51b5](https://github.com/CourtHive/epixodic/commit/f3a51b5a6647a16d198a2f6199789a315598c613))
* **deps:** update dependency tods-competition-factory to v3.8.0 ([d6cc765](https://github.com/CourtHive/epixodic/commit/d6cc765f55b344d77164ea78f2cf6fa0a594eb28))
* **deps:** update dependency tods-competition-factory to v3.9.0 ([60e0b83](https://github.com/CourtHive/epixodic/commit/60e0b83f5c1da4717ce669ba6636999ff7f38bbe))
* **deps:** update dependency tods-competition-factory to v4.0.0 ([1743c6b](https://github.com/CourtHive/epixodic/commit/1743c6b84100bf43e7364755673664058516f936))
* **deps:** update dependency tods-competition-factory to v4.2.0 ([c1a8152](https://github.com/CourtHive/epixodic/commit/c1a8152703829ad4c63438b19e8fd0b9d6d2a675))
* **deps:** update dependency tods-competition-factory to v4.2.0 ([42dc698](https://github.com/CourtHive/epixodic/commit/42dc6988671993220be2bba0a1341d9a65a16963))
* **deps:** update tods-competition-factory to 5.3.0 ([d7ed5ef](https://github.com/CourtHive/epixodic/commit/d7ed5ef9634b07f479074bba8d2521d96c472e44))
* **deps:** update tods-competition-factory to 5.4.0 ([d95f282](https://github.com/CourtHive/epixodic/commit/d95f28231aa7e4205315627b864f3bced892a71c))
* **relay:** anchor ticks from score events + idle timeout cleanup ([e693b2f](https://github.com/CourtHive/epixodic/commit/e693b2fc9eb294f6f6ff33dec783ae3ed1afab0d))
* **relay:** enrich score event display + add package.json scripts ([63acd15](https://github.com/CourtHive/epixodic/commit/63acd157f1a2ef62e525bd64ab42d94609a8bd56))
* **relay:** handle intennse event so enriched snapshots reach listeners ([439a7d6](https://github.com/CourtHive/epixodic/commit/439a7d688eb5ba2063815ac5471d27f90fab2614))
* **score-relay:** add pnpm.onlyBuiltDependencies ([987e51f](https://github.com/CourtHive/epixodic/commit/987e51f753791bf331b6fe70989ae7093a6fccc9))
* **score-relay:** boot fail-fast on strict-auth-without-secret ([e60baa3](https://github.com/CourtHive/epixodic/commit/e60baa3ee33c06125bb555c68a281cc4c2a3211f))
* **score-relay:** give it its own .npmrc + workspace.yaml ([762c69d](https://github.com/CourtHive/epixodic/commit/762c69dff508ac785a6cd6bae44a30af7d58f8e1))
* **score-relay:** move socket.io-client to dependencies ([52114ce](https://github.com/CourtHive/epixodic/commit/52114ceca749f1d96b4e3f395f6fe3b442e7d893))
* **score-relay:** regenerate lockfile + approve esbuild build ([5716997](https://github.com/CourtHive/epixodic/commit/57169978770663b8044380aaf8ca89fc715ea1b5))
* **score-relay:** stamp token's tournamentId on score-aud frames + unref intervals ([8933e96](https://github.com/CourtHive/epixodic/commit/8933e966ffdb60946b9b519b8e884ebb6eee76ac))
* **tracker-auth:** accept userId as fallback subject claim ([526a3d8](https://github.com/CourtHive/epixodic/commit/526a3d8dfe6041fa0f73d69825ce85c07585be92))


### Documentation

* **score-relay:** point deploy block at unified Mentat push-server flow ([8349299](https://github.com/CourtHive/epixodic/commit/834929993800de2d11147f5c4a0224bfd23cbb0d))
