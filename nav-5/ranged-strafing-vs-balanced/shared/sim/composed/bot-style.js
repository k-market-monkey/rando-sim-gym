// Experimental hard-bot movement styles. A style only changes where the bot stands
// and how it strafes, derived from the move's compiled range and preferred distance;
// targeting, attacks, Dash, Shield and threat avoidance are shared. Live matches and
// calibration use 'balanced', the default.

export const MOVEMENT_STYLES = Object.freeze([
  'balanced',
  'aggressive',
  'ranged-strafing',
  'defensive',
]);
/** Ranged strafing needs a move that reaches at least this far; shorter moves stay balanced. */
export const RANGED_REACH = 150;

/**
 * `desired`: the distance the bot strafes around. `gap`: how far inside it the bot
 * starts backing away. `weight`: the sideways share while closing or opening
 * distance. `hold`: whether a strafing segment may stand still sideways.
 */
export function movementStance(style = 'balanced', { preferredDistance, range }) {
  const balanced = { desired: preferredDistance, gap: 25, weight: 0.6, hold: true };
  switch (style) {
    case 'balanced':
      return balanced;
    case 'aggressive':
      // Pressure: close well inside the preferred distance and rarely give ground.
      return {
        desired: Math.min(preferredDistance, Math.max(40, Math.round(preferredDistance * 0.6))),
        gap: 40,
        weight: 0.4,
        hold: true,
      };
    case 'ranged-strafing':
      // Keep the preferred distance and never stop moving sideways.
      return range >= RANGED_REACH ? { ...balanced, weight: 1, hold: false } : balanced;
    case 'defensive':
      // Stand off toward the edge of reach and back away early.
      return {
        desired: Math.max(preferredDistance, Math.min(range, preferredDistance + 60)),
        gap: 15,
        weight: 0.6,
        hold: true,
      };
    default:
      throw Error('Unknown movement style');
  }
}
