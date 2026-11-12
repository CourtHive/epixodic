# Team display defaults and presentation

Epixodic consumes CODES TEAM `teamColors.palette` and optional `display.roles`. Team providers author
these defaults once. Tournament imports carry them with TEAM details, so scorecards and INTENNSE views
render without per-tournament color setup or a live provider lookup.

Supported named roles are `team.surface`, `team.text`, `team.accent`, `score.surface` and `score.text`.
Defaults reference stable palette IDs. Hydrated parent matchUps carry optional `teamPresentation` from
the tournament DISPLAY extension. Resolve team defaults, then all-team overrides, then per-team
exceptions keyed by participantId. `{ theme: true }` selects the theme fallback; omission inherits.

Shared scorecards keep plain headers. Branding is opt-in and applies to names on match lines. Horizontal
and vertical INTENNSE layouts use team and score role surfaces with consumer-local readable foregrounds.
Brand data stays with TEAM identity on presentation-side swaps and substitutions.

The producer sends a low-frequency `teamBranding` complete replacement before the first point and after
identity/default/override changes. The wire contains canonical side 1/2, exposed TEAM ID/name and
`colors.roles` mapping supported role names to opaque uppercase hex values. These values reflect role
assignments and tournament overrides, before consumer-local contrast decisions. Unselected palette
entries, names and groups are omitted. There is no palette duplication on per-point frames.

The relay validates closed role vocabulary/hex values and retains its authentication, match ownership,
rate limiting, cached replacement/replay, federation, reconnect and match cleanup behavior. Empty `teams`
clears the frame. Replacing an identity without colors clears that identity's roles. Missing or privacy-
filtered TEAM palette data is never recovered from raw tournament records.

Arena resolves the same roles against its selected theme and supports manual side-color preference
precedence. Text contrast is checked against the painted region; stored brand values are unchanged.
