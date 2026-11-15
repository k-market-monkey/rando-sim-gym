const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let key = '',
  selected = [],
  deadline = 0,
  offset = 0;
function countdown() {
  const el = document.querySelector('#ban-countdown');
  if (el) {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now() - offset) / 1000));
    el.textContent = seconds ? `${seconds}s remaining` : 'Choosing remaining bans…';
  }
}
setInterval(countdown, 100);
export function renderBanDraft({ room, id, root, headerHTML, bindHeader, send }) {
  const draftKey = room.code + ':' + room.roundNumber;
  if (key !== draftKey) {
    key = draftKey;
    selected = [];
  }
  deadline = room.banDeadline || 0;
  offset = (room.serverNow || Date.now()) - Date.now();
  const roster = room.roundPlayers || [],
    remaining = room.banRemaining?.[id] || 0,
    participating = roster.some((p) => p.id === id),
    limit = room.banLimit || room.roundSettings.bans;
  const available = (choice) => {
    const target = roster.find((p) => p.id === choice.targetId);
    return (
      target &&
      target.loadout.includes(choice.name) &&
      !target.bans.includes(choice.name) &&
      target.bans.length < limit
    );
  };
  const counts = {};
  selected = remaining
    ? selected
        .filter((c) => {
          if (!available(c)) return false;
          const t = roster.find((p) => p.id === c.targetId);
          counts[c.targetId] = (counts[c.targetId] || 0) + 1;
          return counts[c.targetId] <= limit - t.bans.length;
        })
        .slice(0, remaining)
    : [];
  const redraw = () => renderBanDraft({ room, id, root, headerHTML, bindHeader, send });
  root.innerHTML =
    headerHTML +
    `<div class="draft-summary"><div><h2>${participating ? (remaining ? 'Select your bans' : 'Bans confirmed') : 'Watching the draft'}</h2><p>${remaining ? `Select ${remaining} move${remaining === 1 ? '' : 's'}, then Continue. Every fighter must lose exactly ${limit} move${limit === 1 ? '' : 's'}.` : 'Waiting for the remaining choices.'} Self-bans are allowed and may be required. Unsubmitted choices are picked randomly at the deadline.</p></div><strong id="ban-countdown" role="timer"></strong></div><div class="ban-grid">${roster
      .map((p) => {
        const selectedCount = selected.filter((c) => c.targetId === p.id).length;
        return `<section class="panel"><div class="section-head"><h2>${escape(p.name)}${p.id === id ? ' (you)' : ''}</h2><span class="label">${p.bans.length} / ${limit} BANNED</span></div>${p.loadout
          .map((name) => {
            const banned = p.bans.includes(name),
              chosen = selected.some((c) => c.targetId === p.id && c.name === name),
              disabled =
                !remaining ||
                banned ||
                (!chosen &&
                  (p.bans.length + selectedCount >= limit || selected.length >= remaining));
            return `<button class="button ban-move ${banned ? 'banned' : ''} ${chosen ? 'ban-selected' : ''}" data-target="${escape(p.id)}" data-ban="${escape(name)}" aria-pressed="${chosen}" ${disabled ? 'disabled' : ''}><span>${escape(name)}</span><span>${banned ? 'BANNED' : chosen ? 'SELECTED ✓' : 'SELECT'}</span></button>`;
          })
          .join(
            '',
          )}<div class="helper">${room.banSubmitted?.[p.id] ? 'Choice confirmed' : 'Choosing bans'}</div></section>`;
      })
      .join(
        '',
      )}</div>${participating ? `<div class="draft-actions"><span id="ban-selection-count">${remaining ? `${selected.length} / ${remaining} selected` : 'Your choices are locked in.'}</span><button id="ban-continue" class="button primary" ${!remaining || selected.length !== remaining ? 'disabled' : ''}>${remaining ? 'CONTINUE →' : 'CONFIRMED ✓'}</button></div>` : ''}`;
  bindHeader();
  countdown();
  root.querySelectorAll('[data-ban]').forEach(
    (button) =>
      (button.onclick = () => {
        const choice = { targetId: button.dataset.target, name: button.dataset.ban };
        const index = selected.findIndex(
          (c) => c.targetId === choice.targetId && c.name === choice.name,
        );
        if (index >= 0) selected.splice(index, 1);
        else selected.push(choice);
        redraw();
      }),
  );
  root.querySelector('#ban-continue')?.addEventListener('click', () =>
    send({
      type: 'ban',
      roundNumber: room.roundNumber,
      choices: selected.map((c) => ({ ...c })),
    }),
  );
}
