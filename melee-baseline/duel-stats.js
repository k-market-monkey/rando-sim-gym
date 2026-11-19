// Observes completed engine steps. Nothing here writes to the match or replay inputs.
export function collectStats(state) {
  const sides = Object.fromEntries(
    state.players.map((p) => [
      p.id,
      {
        damage: {},
        killedOpponent: false,
        movingTicks: 0,
        distance: 0,
        shieldingTicks: 0,
        parries: 0,
        deflections: 0,
      },
    ]),
  );
  const previous = Object.fromEntries(
    state.players.map((p) => [p.id, { x: p.x, y: p.y, hp: p.hp, dead: p.dead }]),
  );
  return {
    sides,
    step(state) {
      for (const e of state.events) {
        const side = sides[e.playerId];
        if (side && e.type === 'perfect-block') side.parries++;
        if (side && e.type === 'deflect') side.deflections++;
        if (e.type !== 'hit' || !side) continue;
        const victim = previous[e.playerId];
        const lost = Math.min(victim.hp, Math.max(0, e.damage));
        victim.hp -= lost;
        if (!sides[e.owner] || e.owner === e.playerId) continue;
        const weapon =
          e.moveKey === 'builtin:shoot'
            ? 'Built-in gun'
            : e.moveKey === 'builtin:swipe'
              ? 'Built-in swipe'
              : e.move?.name || 'Other';
        const damage = sides[e.owner].damage;
        damage[weapon] = (damage[weapon] || 0) + lost;
      }
      for (const p of state.players) {
        const last = previous[p.id],
          side = sides[p.id];
        // The duel engine credits opponent kills even during the post-KO window.
        side.killedOpponent ||= p.kills > 0;
        if (!last.dead) {
          const distance = Math.hypot(p.x - last.x, p.y - last.y);
          if (distance > 0) side.movingTicks++;
          side.distance += distance;
          if (p.shielding) side.shieldingTicks++;
        }
        Object.assign(last, { x: p.x, y: p.y, hp: p.hp, dead: p.dead });
      }
    },
  };
}
export function distribution(scores) {
  const sorted = [...scores].sort((a, b) => a - b),
    n = sorted.length;
  const quantile = (p) => {
    const i = (n - 1) * p,
      j = Math.floor(i);
    return sorted[j] + (sorted[Math.ceil(i)] - sorted[j]) * (i - j);
  };
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  // Read left to right: first move (+), even, second move (-).
  const bins = Array(11).fill(0);
  for (const score of scores)
    bins[5 - Math.sign(score) * Math.min(5, Math.ceil(Math.abs(score) / 20))]++;
  return {
    five: [sorted[0], quantile(0.25), quantile(0.5), quantile(0.75), sorted[n - 1]],
    variance: sorted.reduce((v, s) => v + (s - mean) ** 2, 0) / n,
    bins,
  };
}
