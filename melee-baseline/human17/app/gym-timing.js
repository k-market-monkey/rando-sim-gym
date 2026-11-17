import { SWIPE } from './gym-swipe.js';
import { SHOOT } from '../shared/sim/composed/shoot.js';
import { SHIELD } from '../shared/sim/composed/shield.js';

const ticks = (n) => `${Math.ceil(n)}f (${(n / 30).toFixed(2)}s)`;
const timer = (label, phase, remaining, total) => ({
  label,
  phase,
  remaining,
  total: Math.max(1, total || remaining),
});
const positive = (list) => list.filter((t) => t && t.remaining > 0);
const row = (id, name, keys, timers, notes = []) => {
  const active = positive(timers),
    primary = active[0];
  return {
    id,
    name,
    keys,
    phase: primary?.phase || 'ready',
    label: primary
      ? primary.untimed
        ? primary.label
        : `${primary.label} · ${ticks(primary.remaining)}`
      : 'Ready',
    progress: primary
      ? Math.max(
          0,
          Math.min(
            1,
            primary.phase === 'active'
              ? primary.remaining / primary.total
              : 1 - primary.remaining / primary.total,
          ),
        )
      : 1,
    details: [...active.slice(1).map((t) => `${t.label} ${ticks(t.remaining)}`), ...notes].join(
      ' · ',
    ),
  };
};
export function timingRows(state, player, { flinch = 0, flinchTotal = 6, parry = 0 } = {}) {
  const resourceRecovery = Math.max(
    0,
    ...Object.values(player.moveResources || {}).map((r) => r.recovery || 0),
  );
  const recoveryTotal = Math.max(
    1,
    SWIPE.recovery,
    ...player.loadout
      .filter((m) => player.moveResources[m.name]?.recovery > 0)
      .map((m) => m.activation.recovery),
  );
  const dead = player.dead && {
    ...timer('Out · resolving effects', 'blocked', 1, 1),
    untimed: true,
  };
  const flinching = flinch && timer('Flinch', 'blocked', flinch, flinchTotal);
  const guard =
    player.shielding &&
    timer('Shield held', 'blocked', Math.ceil(player.shield / SHIELD.drain), 40);
  const release = timer('Shield lowering', 'blocked', player.shieldRelease, SHIELD.release);
  const dash = timer('Dashing', 'active', player.dashTicks, 5);
  const otherWindup =
    player.attack &&
    timer(
      'Other attack windup',
      'blocked',
      player.attack.remaining,
      player.loadout[player.attack.slot].activation.windup,
    );
  const swipeWindup =
    player.swipeAttack &&
    timer('Swipe windup', 'blocked', player.swipeAttack.remaining, SWIPE.windup);
  const swipeRecovery = timer('Swipe recovery', 'blocked', player.swipeRecovery, SWIPE.recovery);
  const results = player.loadout.map((move, index) => {
    const r = player.moveResources[move.name] || {};
    const ownWindup =
      player.attack?.slot === index &&
      timer('Windup', 'windup', player.attack.remaining, move.activation.windup);
    const effects = state.entities.filter(
      (e) => e.owner === player.id && e.move?.name === move.name && !e.removed && e.ttl > 0,
    );
    const attached = effects.filter(
      (e) => move.templates.find((t) => t.id === e.templateId)?.motion.kind === 'caster_attached',
    );
    const live = attached.reduce((best, e) => (!best || e.ttl > best.ttl ? e : best), null);
    const notes = [];
    if (r.sequence)
      notes.push(`Placement ${r.sequence}${r.timeout ? ' · expires ' + ticks(r.timeout) : ''}`);
    if (['magazine', 'charges'].includes(move.resource.kind))
      notes.push(`Ammo ${r.ammo}/${move.resource.capacity}`);
    if (move.resource.kind === 'heat')
      notes.push(`Heat ${Math.round(r.heat || 0)}/${move.resource.threshold}`);
    if (move.resource.kind === 'fatigue') notes.push(`Fatigue ${r.fatigue || 0}/4`);
    const otherRecovery = Math.max(
      0,
      ...Object.entries(player.moveResources)
        .filter(([name]) => name !== move.name)
        .map(([, value]) => value.recovery || 0),
    );
    return row(
      `special-${index}`,
      move.name,
      index === 0 ? 'C / 1' : String(index + 1),
      [
        dead,
        flinching,
        guard,
        release,
        dash,
        ownWindup,
        player.attack?.slot !== index && otherWindup,
        swipeWindup,
        swipeRecovery,
        timer('Other move recovery', 'blocked', otherRecovery, recoveryTotal),
        live && timer('Active', 'active', live.ttl, live.lifetime),
        timer('Recovery', 'recovery', r.recovery, move.activation.recovery),
        timer('Reload', 'cooldown', r.reload, move.resource.reload),
        r.overheated &&
          timer(
            'Overheated',
            'overheated',
            Math.ceil(Math.max(0, r.heat - move.resource.threshold * 0.25) / move.resource.cooling),
            Math.ceil((move.resource.threshold * 0.75) / move.resource.cooling),
          ),
        timer('Cooldown', 'cooldown', r.cooldown, move.resource.cooldown),
      ],
      notes,
    );
  });
  results.push(
    row(
      'swipe',
      'Swipe',
      'Right-click / X',
      [
        dead,
        flinching,
        guard,
        release,
        dash,
        otherWindup,
        player.swipeAttack && timer('Windup', 'windup', player.swipeAttack.remaining, SWIPE.windup),
        state.events.some((e) => e.type === 'swipe-contact' && e.playerId === player.id) &&
          timer('Contact', 'active', 1, 1),
        timer('Recovery', 'recovery', player.swipeRecovery, SWIPE.recovery),
        timer('Other move recovery', 'blocked', resourceRecovery, recoveryTotal),
        timer(
          'Cooldown',
          'cooldown',
          player.swipeCooldown,
          state.swipeCooldownFrames ?? SWIPE.cooldown,
        ),
      ],
      state.events.some((e) => e.type === 'swipe-contact' && e.playerId === player.id)
        ? ['Contact this frame']
        : [],
    ),
  );
  results.push(
    row(
      'shoot',
      'Gun',
      'Left-click',
      [
        dead,
        flinching,
        guard,
        release,
        dash,
        otherWindup,
        swipeWindup,
        player.channel != null &&
          !player.attack && { ...timer('Channeling special', 'blocked', 1, 1), untimed: true },
        player.shootOverheated &&
          timer(
            'Overheated',
            'overheated',
            Math.ceil(Math.max(0, player.shootHeat - SHOOT.recoverAt) / SHOOT.cooling),
            Math.ceil((SHOOT.threshold - SHOOT.recoverAt) / SHOOT.cooling),
          ),
        timer('Fire interval', 'cooldown', player.shootCooldown, SHOOT.interval),
      ],
      [
        `Heat ${(player.shootHeat || 0).toFixed(1)}/${SHOOT.threshold}`,
        ...(player.shootHeat > 0
          ? [`Fully cool in ${ticks(Math.ceil(player.shootHeat / SHOOT.cooling))}`]
          : []),
      ],
    ),
  );
  const shieldTimers = player.shielding
    ? [
        timer(
          player.shieldPerfect > 0 ? 'Parry active' : 'Shield held',
          'active',
          player.shieldPerfect > 0 ? player.shieldPerfect : Math.ceil(player.shield / SHIELD.drain),
          player.shieldPerfect > 0 ? SHIELD.perfect : 40,
        ),
      ]
    : positive([
        timer(
          'Attack recovery',
          'recovery',
          Math.max(resourceRecovery, player.swipeRecovery || 0),
          recoveryTotal,
        ),
        timer('Lowering', 'recovery', player.shieldRelease, SHIELD.release),
        timer('Cooldown', 'cooldown', player.shieldCooldown, SHIELD.cooldown),
        player.shieldLocked &&
          timer(
            'Refilling',
            'recovery',
            Math.ceil((100 - player.shield) / SHIELD.recharge),
            Math.ceil(100 / SHIELD.recharge),
          ),
        timer('Dashing', 'blocked', player.dashTicks, 5),
      ]).sort((a, b) => b.remaining - a.remaining);
  results.push(
    row(
      'shield',
      'Shield',
      'Shift',
      [dead, ...shieldTimers],
      [
        `Charge ${Math.round(player.shield)}/100`,
        ...(parry ? [`Counter release window ${ticks(parry)}`] : []),
        ...(player.shieldRelease > 0 ? [`Attack/dash lock ${ticks(player.shieldRelease)}`] : []),
      ],
    ),
  );
  results.push(
    row('dash', 'Dash', 'Space', [
      dead,
      dash,
      guard,
      release,
      timer('Cooldown', 'cooldown', player.dashCooldown, 45),
    ]),
  );
  return results;
}
export function renderTiming(container, state, player, options) {
  const rows = timingRows(state, player, options);
  for (const model of rows) {
    let element = container.querySelector(`[data-timing="${model.id}"]`);
    if (!element) {
      element = document.createElement('div');
      element.className = 'timing-row';
      element.dataset.timing = model.id;
      const heading = document.createElement('div');
      heading.className = 'timing-heading';
      const name = document.createElement('strong'),
        key = document.createElement('kbd');
      heading.append(name, key);
      const status = document.createElement('div');
      status.className = 'timing-status';
      const track = document.createElement('div');
      track.className = 'timing-track';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      const fill = document.createElement('div');
      fill.className = 'timing-fill';
      track.append(fill);
      const details = document.createElement('div');
      details.className = 'timing-details';
      element.append(heading, status, track, details);
      container.append(element);
    }
    element.dataset.phase = model.phase;
    element.querySelector('strong').textContent = model.name;
    element.querySelector('kbd').textContent = model.keys;
    element.querySelector('.timing-status').textContent = model.label;
    element.querySelector('.timing-details').textContent = model.details;
    const track = element.querySelector('.timing-track');
    track.setAttribute('aria-label', `${model.name} timing`);
    track.setAttribute('aria-valuenow', String(Math.round(model.progress * 100)));
    track.setAttribute('aria-valuetext', model.label);
    element.querySelector('.timing-fill').style.width = `${model.progress * 100}%`;
  }
  return rows;
}
