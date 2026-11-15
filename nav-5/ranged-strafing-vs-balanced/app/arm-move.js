// Hover to arm: a move in another player's lobby card shows slot buttons, and
// clicking one puts that move in the same slot of your next loadout.

/**
 * One move chip in another player's card. `armable` is true when this
 * browser's library has the full move, so arming needs no generation.
 */
export function movePeekMarkup({ name, index, slots, armable, esc }) {
  const chip = `<span class="move-peek ${name ? '' : 'empty'}">${index + 1}. ${esc(name || 'Empty')}</span>`;
  if (!name || !armable) return chip;
  const buttons = Array.from(
    { length: slots },
    (_, slot) =>
      `<button type="button" class="arm-slot" data-arm-move="${esc(name)}" data-arm-slot="${slot}" aria-label="Arm ${esc(name)} in slot ${slot + 1}" title="Arm in slot ${slot + 1}">${slot + 1}</button>`,
  ).join('');
  return `<span class="move-arm" tabindex="0" title="Arm ${esc(name)} in your next loadout">${chip}<span class="arm-slots" role="group" aria-label="Arm ${esc(name)}">${buttons}</span></span>`;
}

/** Calls `onArm(name, slot)` when a slot button inside `root` is clicked. */
export function installArmMove(root, onArm) {
  root.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-arm-move]');
    if (!button) return;
    onArm(button.dataset.armMove, Number(button.dataset.armSlot));
  });
}
