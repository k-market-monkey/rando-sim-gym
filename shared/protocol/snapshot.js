import { mechanicsVersionForFormat } from './versions.js';

// This is the display contract, not a serialization of simulation state. Keep
// new engine fields off the wire until a browser consumer needs them here.
const ROUND_FIELDS = [
  'formatVersion',
  'engineBuild',
  'mechanicsVersion',
  'mode',
  'timeLimit',
  'teamBattle',
  'stage',
  'mapRevision',
  'survivalRevision',
  'selfDamageRulesRevision',
  // Present only when the room turned them off. The HUD hides a disabled action;
  // the renderer's force-field check reads friendly fire.
  'friendlyFire',
  'dashEnabled',
  'shieldEnabled',
  'meleeEnabled',
  'botDifficulty',
  'flagBases',
  'combatMoves',
  // Present only when the map is larger than the default 960 by 640 arena.
  'arenaWidth',
  'arenaHeight',
  'preview',
];
const PLAYER_STATIC = [
  'id',
  'name',
  'team',
  'color',
  'secondaryColor',
  'look',
  'maxHp',
  'handicapPercent',
];
const TICK_FIELDS = [
  'tick',
  'ring',
  'ended',
  'winner',
  'winners',
  'winnerTeam',
  'teamScores',
  // Item drops, present only when the room turned them on.
  'items',
  'flags',
];
const PLAYER_TICK = [
  'id',
  'x',
  'y',
  'vx',
  'vy',
  'hp',
  'shield',
  'shielding',
  'shieldLocked',
  'shieldRelease',
  'invuln',
  'dashCooldown',
  'dashTicks',
  'score',
  'kills',
  'deaths',
  'lives',
  'dead',
  'respawn',
  'cooldowns',
  'uses',
  'fatigue',
  'aimX',
  'aimY',
  'itemShield',
  'itemSpeed',
  'meleeCooldown',
  'meleeRecovery',
];
const RESOURCE = [
  // Keep activation counts for the client's input diagnostics, like Classic uses.
  'uses',
  'cooldown',
  'recovery',
  'ammo',
  'reload',
  'heat',
  'overheated',
  'fatigue',
  'sequence',
  'timeout',
];
const ATTACK = ['slot', 'remaining', 'aimX', 'aimY', 'firingPose'];
const ENTITY = [
  'moveKey',
  'id',
  'owner',
  'kind',
  'templateId',
  'x',
  'y',
  'vx',
  'vy',
  'dx',
  'dy',
  'angle',
  'radius',
  'physicalRadius',
  'age',
  // Push arrows show only once a field is armed (public/composed-renderer.js).
  'arm',
  'bornTick',
  'windup',
  'ttl',
  'lifetime',
  'color',
  'coreColor',
  'warning',
  'hp',
  'maxHp',
  // Telegraphs call teleportDestination/previewRay, which inspect collisions.
  'solid',
  'removed',
];
const APPEARANCE = ['name', 'team', 'color', 'secondaryColor', 'look'];
const RAY_SEGMENT = ['x', 'y', 'endX', 'endY', 'objectId', 'entityId'];
const MAP_STATIC = ['id', 'revision', 'ruleset'];
const OBJECT_STATIC = ['id', 'x', 'y', 'w', 'h', 'material', 'maxHp'];
const OBJECT_TICK = ['id', 'hp', 'solid', 'pendingDestroy'];
const EVENT = [
  'moveKey',
  'team',
  'flagTeam',
  'reason',
  'type',
  'id',
  'playerId',
  'owner',
  'x',
  'y',
  'fromX',
  'fromY',
  'damage',
  'color',
  'emote',
  'item',
];

function pick(source, fields) {
  const result = {};
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined)
      result[field] = value !== null && typeof value === 'object' ? structuredClone(value) : value;
  }
  return result;
}

/** Static round data, sent at round start and to every late joiner/resumer. */
export function encodeRound(state, room = {}) {
  /** @type {Record<string, any>} */
  const round = {
    type: 'round',
    ...pick(state, ROUND_FIELDS),
    roundNumber: state.roundNumber ?? room.roundNumber ?? 0,
    engine: state.mechanicsVersion || mechanicsVersionForFormat(state.formatVersion)?.id,
    players: state.players.map((player) => ({
      ...pick(player, PLAYER_STATIC),
      loadout: structuredClone(player.loadout),
    })),
  };
  if (state.flagBases)
    round.flagBases = state.flagBases.map((base) => pick(base, ['team', 'x', 'y']));
  if (state.combatMoves)
    round.combatMoves = Object.fromEntries(
      Object.entries(state.combatMoves).map(([key, entry]) => [
        key,
        pick(entry, ['name', 'playerIndex', 'slot', 'builtin']),
      ]),
    );
  if (room.code !== undefined) round.roomCode = room.code;
  // The map catalog already lives in the browser, selected by stage/revision.
  // Only the static portion of mutable map objects needs to travel here.
  if (state.map) {
    round.map = {
      ...pick(state.map, MAP_STATIC),
      objects: state.map.objects.map((object) => pick(object, OBJECT_STATIC)),
    };
    if (state.map.controllers)
      round.map.controllers = state.map.controllers.map((controller) => pick(controller, ['id']));
  }
  return round;
}

/**
 * Complete display values for one tick, never a delta from a previous tick.
 * Room-owned metadata is { roomCode?, roundNumber?, paused?, inputAcks? };
 * callers must pass pause and acknowledgements rather than writing engine state.
 */
export function encodeTick(state, events = state.events || [], metadata = {}) {
  /** @type {Record<string, any>} */
  const tick = {
    type: 'tick',
    ...pick(state, TICK_FIELDS),
    roundNumber: metadata.roundNumber ?? state.roundNumber ?? 0,
    paused: !!metadata.paused,
    inputAcks: structuredClone(metadata.inputAcks || {}),
    players: state.players.map((player) => {
      const result = pick(player, PLAYER_TICK);
      if (player.meleeAttack !== undefined)
        result.meleeAttack =
          player.meleeAttack === null ? null : pick(player.meleeAttack, ['remaining', 'direction']);
      if (player.attack !== undefined)
        result.attack = player.attack === null ? null : pick(player.attack, ATTACK);
      if (player.moveResources)
        result.moveResources = Object.fromEntries(
          Object.entries(player.moveResources).map(([name, resource]) => [
            name,
            pick(resource, RESOURCE),
          ]),
        );
      return result;
    }),
    entities: state.entities.map((entity) => {
      const result = pick(entity, ENTITY);
      result.move = entity.move.name;
      if (entity.linkTo !== undefined)
        result.linkTo = entity.linkTo === null ? null : pick(entity.linkTo, ['x', 'y']);
      if (entity.raySegments)
        result.raySegments = entity.raySegments.map((segment) => pick(segment, RAY_SEGMENT));
      if (entity.actor)
        result.actor = {
          kind: entity.actor.kind,
          appearance: pick(entity.actor.appearance || {}, APPEARANCE),
        };
      return result;
    }),
    events: events.map((event) => {
      const result = pick(event, EVENT);
      if (event.move !== undefined)
        result.move = typeof event.move === 'string' ? event.move : event.move.name;
      return result;
    }),
  };
  if (state.flags)
    tick.flags = state.flags.map((flag) =>
      pick(flag, ['team', 'status', 'x', 'y', 'carrierId', 'returnTicks', 'changedTick']),
    );
  if (metadata.roomCode !== undefined) tick.roomCode = metadata.roomCode;
  if (state.map) {
    tick.map = { objects: state.map.objects.map((object) => pick(object, OBJECT_TICK)) };
    if (state.map.controllers)
      tick.map.controllers = state.map.controllers.map((controller) =>
        pick(controller, ['id', 'phase']),
      );
  }
  return tick;
}

/** Reconstruct the renderer's view, or ignore a tick without its matching round. */
export function applyTick(round, tick) {
  if (
    !round ||
    !tick ||
    round.roundNumber !== tick.roundNumber ||
    (round.roomCode !== undefined &&
      tick.roomCode !== undefined &&
      round.roomCode !== tick.roomCode)
  )
    return null;
  const players = new Map(round.players.map((player) => [player.id, player])),
    definitions = new Map(
      round.players.flatMap((player) => player.loadout.map((move) => [move.name, move])),
    );
  const combatDefinitions = new Map(
    Object.entries(round.combatMoves || {}).map(([key, entry]) => [
      key,
      entry.builtin === 'melee'
        ? { name: 'Melee' }
        : round.players[entry.playerIndex]?.loadout[entry.slot],
    ]),
  );
  const definition = (record) =>
    combatDefinitions.get(record.moveKey) || definitions.get(record.move);
  /** @type {Record<string, any>} */
  const state = {
    ...pick(round, ROUND_FIELDS),
    ...pick(tick, TICK_FIELDS),
    roundNumber: round.roundNumber,
    paused: tick.paused,
    players: tick.players.map((player) => ({ ...players.get(player.id), ...player })),
    entities: tick.entities.map((entity) => {
      const move = definition(entity),
        template = move?.templates?.find((template) => template.id === entity.templateId);
      return {
        ...entity,
        move,
        ...(template
          ? {
              geometry: template.geometry[0],
              geometries: template.geometry,
              motion: template.motion,
              force: template.force.direction === 'none' ? null : template.force,
            }
          : {}),
      };
    }),
    // Sound and the combat stream both consume the cast's move definition.
    events: tick.events.map((event) =>
      event.move === undefined && event.moveKey === undefined
        ? { ...event }
        : { ...event, move: definition(event) },
    ),
  };
  if (round.map) {
    const objects = new Map(round.map.objects.map((object) => [object.id, object]));
    state.map = {
      ...pick(round.map, MAP_STATIC),
      objects: (tick.map?.objects || []).map((object) => ({
        ...objects.get(object.id),
        ...object,
      })),
    };
    if (round.map.controllers) state.map.controllers = structuredClone(tick.map?.controllers || []);
  }
  return state;
}
