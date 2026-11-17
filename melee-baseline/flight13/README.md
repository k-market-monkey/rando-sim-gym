# Interactive projectile-heading experiment

Build `composed-b9002` is the play-only fork of the previous gym. Free-flight
projectiles use 1,024 directions while retaining 32 angle units per turn.
`shared/sim/composed/projectile-heading.js` owns the scoped lookup/selection.
Other changed simulation modules: geometry, runtime, features, deflection,
bot-builtins and hard-bot. Their callers share this isolated import graph.

The quarter-turn table is committed integer constants at scale 1,048,576;
generated offline, with no runtime trigonometry. Selection is an eight-step
quadrant search plus a comparison of neighboring normalized directions.

The existing `replay/` sources, recorded games and `play-v12.html` remain the
previous experiment. This fork is not a registered recorded-replay engine;
its replay-build manifest is deliberately empty. Source and checks are retained
in the main workspace under `artifacts/gym-heading-work/`.
