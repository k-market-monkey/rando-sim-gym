# Tunable gym client

The composed-b9005 engine is unchanged from the defense-tuned human16 experiment.
The client accepts a sanitized `tune` URL object and applies radius, windup and
cooldown overrides to copies of the three recorded move definitions. Shared
controls are forwarded to match creation. No live move library is modified.

The baseline dashboard owns tuning/local storage and runs background simulations
in a module Worker. Every game pins its definitions/settings in its header and
is checkpoint-verified before results are returned. Replay controls support
Normal (0.75×); fixed player-card/timing-row dimensions keep the arena stable.
