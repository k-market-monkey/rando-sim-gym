/** Room notifications share the normal sound preference and unlocked audio context. */
export function createLobbySounds(sound) {
  return {
    room(previous, next, { id, resuming = false } = {}) {
      // Snapshots establish membership, including after a reconnect; they are not arrivals.
      if (!previous || previous.code !== next.code || resuming) return;
      const humans = (room) =>
        new Set(room.players.filter((p) => !p.bot && p.id !== id).map((p) => p.id));
      const before = humans(previous),
        after = humans(next);
      // Bound each update to one cue per kind, even when several seats change together.
      if ([...after].some((playerId) => !before.has(playerId)))
        sound({ wave: 'sine', frequency: 720, slide: 240, duration: 160 }, 0.035);
      if ([...before].some((playerId) => !after.has(playerId)))
        sound({ wave: 'sine', frequency: 480, slide: -160, duration: 180 }, 0.03);
    },
    chat(message, id) {
      sound(
        message.playerId === id
          ? { wave: 'sine', frequency: 420, slide: 160, duration: 85 }
          : { wave: 'triangle', frequency: 660, slide: -120, duration: 110 },
        0.025,
      );
    },
  };
}
