# Changelog

## [0.5.2](https://github.com/CourtHive/epixodic/compare/score-relay-v0.5.1...score-relay-v0.5.2) (2026-08-15)


### Bug Fixes

* **deps:** update tods-competition-factory to 6.21.0 ([d24d3fa](https://github.com/CourtHive/epixodic/commit/d24d3fa74d3420349dc9b73e2c1576e78ac57a41))
* **deps:** update tods-competition-factory to 6.22.0 ([c6c058d](https://github.com/CourtHive/epixodic/commit/c6c058d6606c1dd4c238e4a3707ad301ed0e1d10))
* **deps:** update tods-competition-factory to 6.22.1 ([c60b8c5](https://github.com/CourtHive/epixodic/commit/c60b8c52f7ff1cdac91e6ec5af7a65699e0b602c))
* **deps:** update tods-competition-factory to 6.23.0 ([d3caefe](https://github.com/CourtHive/epixodic/commit/d3caefeb69a6f145b5d8e5b6531c149d2b5676b8))
* **deps:** update tods-competition-factory to 6.24.0 ([cc2a450](https://github.com/CourtHive/epixodic/commit/cc2a450a30985173665be85ec646cd744ec06424))
* **deps:** update tods-competition-factory to 6.25.0 ([fcc0200](https://github.com/CourtHive/epixodic/commit/fcc0200124fd9a95566b72af7921095c5248ebed))

## [0.5.1](https://github.com/CourtHive/epixodic/compare/score-relay-v0.5.0...score-relay-v0.5.1) (2026-08-09)


### Bug Fixes

* **deps:** update tods-competition-factory to 6.20.0 ([e117f97](https://github.com/CourtHive/epixodic/commit/e117f9716015f516d5c0c3c31f400b391d568b10))

## [0.5.0](https://github.com/CourtHive/epixodic/compare/score-relay-v0.4.0...score-relay-v0.5.0) (2026-08-07)


### Features

* **point-history:** materialize promoted crowd points to courthive-query (S6) ([9a5d0db](https://github.com/CourtHive/epixodic/commit/9a5d0db963b327e9a70fdff06ef6b19bd4b94f14))
* **point-history:** relay per-point write path to courthive-query (S3) ([0a93164](https://github.com/CourtHive/epixodic/commit/0a93164b03eaa7e825ee90b47ca66048954714f7))


### Bug Fixes

* **deps:** update tods-competition-factory to 6.12.0 ([15d8131](https://github.com/CourtHive/epixodic/commit/15d81318a601560e924fae6b70470bfc73d1a652))
* **deps:** update tods-competition-factory to 6.13.0 ([9ce3e43](https://github.com/CourtHive/epixodic/commit/9ce3e438c0e6a982c4b7df706a003af6d1c34faa))
* **deps:** update tods-competition-factory to 6.13.1 ([05ed92d](https://github.com/CourtHive/epixodic/commit/05ed92dcaabbe43f64af9d306b8cc03883f5e2bf))
* **deps:** update tods-competition-factory to 6.13.2 ([aab2008](https://github.com/CourtHive/epixodic/commit/aab2008e4057e55cce606e080695516ba9fb609a))
* **deps:** update tods-competition-factory to 6.14.0 ([4691b6d](https://github.com/CourtHive/epixodic/commit/4691b6da3d17c6708b43cf571d2c5c2462c98d81))
* **deps:** update tods-competition-factory to 6.14.1 ([76044b5](https://github.com/CourtHive/epixodic/commit/76044b53fb196eb725b4590f9ece556d28a4f8eb))
* **deps:** update tods-competition-factory to 6.15.0 ([e8d2e37](https://github.com/CourtHive/epixodic/commit/e8d2e374b5d9f2f27b3ca3f02c46cbdb1dcf6ee3))
* **deps:** update tods-competition-factory to 6.16.0 ([b9864cc](https://github.com/CourtHive/epixodic/commit/b9864cce277ac6ad8fa5f1bb16ad4dd0a2674716))
* **deps:** update tods-competition-factory to 6.17.0 ([7edca1a](https://github.com/CourtHive/epixodic/commit/7edca1a62a8b9d7ae8bc57efa7eef0e4be0dcd0f))
* **deps:** update tods-competition-factory to 6.18.0 ([f7b76b6](https://github.com/CourtHive/epixodic/commit/f7b76b680e50426b9bd6455689e797077f7eb759))
* **deps:** update tods-competition-factory to 6.19.0 ([ccdaff0](https://github.com/CourtHive/epixodic/commit/ccdaff0d79da7fe61fa372357acea730ebb34efa))
* **relay:** CORS headers on hand-rolled REST endpoints ([ee59e68](https://github.com/CourtHive/epixodic/commit/ee59e688d7633343c33d8edb973814ed8855c947))

## [0.4.0](https://github.com/CourtHive/epixodic/compare/score-relay-v0.3.1...score-relay-v0.4.0) (2026-07-21)


### Features

* **crowd:** accept scoped score-audience token on the /crowd relay ([#279](https://github.com/CourtHive/epixodic/issues/279)) ([bdc8333](https://github.com/CourtHive/epixodic/commit/bdc8333c926a7e4bb3a1a95afa25b5c901a5f0dc))
* **score-relay:** dual-accept es256 tokens alongside legacy hs256 ([1849062](https://github.com/CourtHive/epixodic/commit/1849062ab23744e8f65096d035501528ef351236))
* **score-relay:** JWT_ACCEPT_HS256=false toggle to drop legacy tokens ([80b6371](https://github.com/CourtHive/epixodic/commit/80b6371f34de27ae4ced82b972f98a1798320006))


### Bug Fixes

* **deps:** sync score-relay lockfile to tods-competition-factory 6.1.1 ([caec129](https://github.com/CourtHive/epixodic/commit/caec129eed972ea8dcc88c4f4aedb4157e8df960))
* **deps:** update tods-competition-factory to 6.10.0 ([9aa6a75](https://github.com/CourtHive/epixodic/commit/9aa6a759f894fae8b5d335f134c5940fbe8ae87d))
* **deps:** update tods-competition-factory to 6.11.0 ([1ae3c83](https://github.com/CourtHive/epixodic/commit/1ae3c83118335ac4142c22d9f38380ea8cd074b2))
* **deps:** update tods-competition-factory to 6.2.0 ([6f4cf91](https://github.com/CourtHive/epixodic/commit/6f4cf918796ed9153607a283047c8099242ad63c))
* **deps:** update tods-competition-factory to 6.3.0 ([7f8394a](https://github.com/CourtHive/epixodic/commit/7f8394aed0dc77433d77c1674d9552103632e623))
* **deps:** update tods-competition-factory to 6.4.0 ([0d36439](https://github.com/CourtHive/epixodic/commit/0d364398bd57e60d617562e34d94ed0be0653da6))
* **deps:** update tods-competition-factory to 6.5.0 ([4730600](https://github.com/CourtHive/epixodic/commit/4730600a7bf4cc39343463e6e968cb256d95949e))
* **deps:** update tods-competition-factory to 6.6.0 ([98e869d](https://github.com/CourtHive/epixodic/commit/98e869d193d98ddfee808d165b44a25573b05346))
* **deps:** update tods-competition-factory to 6.7.0 ([ec964e7](https://github.com/CourtHive/epixodic/commit/ec964e7fc8f104c9e74a026cb0f49bb11bc45d55))

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
