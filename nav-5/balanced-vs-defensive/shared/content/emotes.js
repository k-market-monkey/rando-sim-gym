// Emotes a player sends with keys 6, 7, 8, 9 and 0. Input carries the number,
// 1 to EMOTES.length; the engine reports it as an `emote` event.
export const EMOTES = Object.freeze(['laughing', 'heart eyes', 'flushed', 'single tear', 'angry']);
/** Accept one reaction each simulation tick; taps and held-key repeats may overlap. */
export const EMOTE_COOLDOWN = 1;
