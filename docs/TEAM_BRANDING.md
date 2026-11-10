# TEAM branding

TEAM colors live on the tournament participant as `teamColors: { primary, secondary? }`, opaque six-digit hex. Epixodic reads only hydrated TEAM sides; a participant privacy policy that excludes colors deliberately produces neutral branding. Individual/PAIR colors are never a source. The shared tournament scorecard opts into `renderScorecard({ teamBranding: true })`; explicit composition `configuration.sideColors` maps/callbacks remain authoritative, including partial/empty results.

INTENNSE horizontal/vertical views draw accent borders and retain the existing readable text, score and serving colors. The display's side-swap projection moves team identity and colors together. Published relay sides stay canonical 1/2; `server` remains its separate legacy 0/1 contract.

## Wire event

`teamBranding` travels from the authenticated `/tracker` namespace to `/live`. It is a low-frequency complete metadata replacement, separate from `score`, `intennse` and 10 Hz ticks:

```json
{
  "matchUpId": "bolt-id",
  "tournamentId": "tournament-id",
  "teams": {
    "1": {
      "participantId": "team-alpha",
      "participantName": "Alpha",
      "colors": { "primary": "#AABBCC", "secondary": "#112233" }
    },
    "2": { "participantId": "team-beta", "participantName": "Beta" }
  }
}
```

`matchUpId` and each included `participantId` are required nonempty strings, at most 200 characters. `tournamentId` and team names are optional (names also at most 200 characters). Teams use only keys 1 and 2; the same identity cannot occupy both. Colors are optional; a nonempty closed color object requires primary and permits secondary. Only six-digit opaque hex is accepted and normalized to uppercase. Malformed replacements are refused atomically. Only known identity/name/color fields cross the metadata boundary; raw rosters and participant records do not.

A side entry without `colors` clears its old colors. `teams: {}` clears the whole metadata palette. This is not a patch/merge API. Missing metadata from an old producer remains compatible with old score/intennse consumers; a new consumer starts with its own neutral/skin palette. Unknown events are harmless to older consumers.

## Delivery and lifecycle

`buildIntennseSnapshot` attaches current metadata as an internal producer field. `sendIntennseUpdate` removes it from the frequent snapshot and calls `sendTeamBranding`, which emits only when the normalized replacement changes. One latest snapshot is retained for the current producer match. Offline changes collapse to that latest snapshot; tracker connect/reconnect republishes it. `disconnectAll` clears it. No new timer, per-point metadata repetition or CFS mutation is introduced.

The relay validates metadata, then applies the existing tracker ownership/authentication and control rate-limit guards. Score-audience tournament scope is stamped from the JWT when omitted; a mismatch is refused. Accepted frames are cached and fanned out to match, tournament and all rooms, with the usual acknowledgement. Initial subscriptions replay the cached metadata even while idle. Ordinary score updates preserve it. Explicit match removal/stale pruning removes it with the existing match state; there is no unbounded second metadata cache or database migration.

A restarted relay starts empty until the producer reconnects and republishes. A federating relay republishes its bounded active-match metadata on upstream reconnect, including after an upstream restart. The metadata is ephemeral display state, not a durable source of tournament truth.

Arena validates replacements again, filters by selected match, and resets state/subscriptions on match change. Its reconnect handler rejoins the match room. All five skins inherit match-scoped accent tokens on the scoreboard host and show an outlined swatch beside each branded team name, including break/final views. Explicit custom side colors win, then TEAM primary, then the selected skin's existing palette. Automatic colors never enter `skinConfig` or localStorage and never paint names/scores. Secondary remains available in metadata for future trims; Arena currently consumes primary accents. The default Arena palette remains intentional.

## Release order

These sources need the factory release containing the stored model/writes/hydration and the components release containing `ScorecardOptions.teamBranding`. Verify the server's factory pin and deploy-host sibling `dist` resolution before enabling the editor in a deployed TMX build. Local sibling builds are integration evidence, not published-package evidence. Package publication, consumer pin updates and deployment are separate release actions.

The metadata DTO/validator is intentionally dependency-free in the producer, relay and standalone Arena. Keep their field/normalization contract aligned when extending it; new fields must be optional for older consumers. Do not import factory types into Arena or bypass participant privacy to reconstruct missing branding.
