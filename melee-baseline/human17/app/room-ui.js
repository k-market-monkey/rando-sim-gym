import { memberStateLabel } from './member-state.js';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../shared/protocol/message-constants.js';
import { TEAMS } from '../shared/sim/teams.js';
import { maxHealth } from '../shared/sim/health.js';
import { getMechanicsVersion } from '../shared/protocol/versions.js';
import { COMPOSED_FEATURES } from '../shared/content/composed/move-features.js';
import { hostIconMarkup } from './member-icons.js';
import { playerSettingsMarkup } from './player-settings.js';
import { movePeekMarkup } from './arm-move.js';
import { characterEditorMarkup, bindCharacterEditor } from './character-editor.js';
import { mapSelectorMarkup, bindMapSelector } from './map-selector.js';
import { roomSettingsFormMarkup, settingValue } from './room-settings-form.js';
import { drawAvatar } from './renderer.js';
import { serverInvite } from './servers.js';
import { BUILTIN_LABELS, builtinActionsFor, hotkeyLabel } from './preferences.js';
const DISCORD_INVITE = 'https://discord.gg/9B9HWkW94';
export const discordLinkMarkup = () =>
  `<a class="button small subtle discord-link" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer">JOIN THE DISCORD ↗</a>`;
const BUILTIN_HINTS = {
  dash: 'Tap for a quick burst of movement.',
  shield: 'Hold to block. Release to recharge.',
  shoot: 'Fire a light, steady shot.',
  swipe: 'Slash nearby; breaks bees and knocks shots away.',
};

export function createRoomUI({
  store,
  connection,
  servers,
  profileClient,
  loadout,
  ready,
  roomLibrary,
  send,
  toast,
  leave,
  esc,
}) {
  const $ = (selector) => document.querySelector(selector);
  const characterProfile = profileClient.appearance,
    changeProfile = profileClient.changeProfile;
  function selectedPlayers() {
    return store.room.players.filter((p) =>
      (store.room.nextPlayerIds || store.room.players.map((p) => p.id)).includes(p.id),
    );
  }
  function member() {
    return store.room?.players.find((p) => p.id === connection.id);
  }
  function seatLabel(p) {
    if (p.queued === false) return 'SPECTATING';
    return (store.room.nextPlayerIds || []).includes(p.id) ? 'NEXT ROUND' : 'WAITING FOR A SEAT';
  }
  function accessMarkup() {
    if (store.room.practice)
      return '<p class="helper">Solo bot match · Hidden from the room browser. Other players cannot join.</p>';
    if (store.room.hostId !== connection.id)
      return `<p class="helper">${store.room.private ? 'This room is password protected.' : 'This room is public and listed in the room browser.'}</p>`;
    return `<details class="access-controls"><summary>${store.room.private ? 'PRIVATE ROOM · CHANGE ACCESS' : 'PUBLIC ROOM · CHANGE ACCESS'}</summary><form id="access-form"><label class="access-checkbox"><input id="access-private" type="checkbox" ${store.room.private ? 'checked' : ''}> Require a password</label><input id="access-password" type="password" minlength="${PASSWORD_MIN_LENGTH}" maxlength="${PASSWORD_MAX_LENGTH}" autocomplete="new-password" placeholder="${store.room.private ? 'New password, or leave blank to keep it' : 'Choose a password · 8–64 characters'}" ${store.room.private ? '' : 'hidden'}><button type="submit" class="button small subtle">SAVE ROOM ACCESS</button></form><p class="helper">Both public and private rooms appear in the room browser. People already here can stay.</p></details>`;
  }
  function pingLabel(p) {
    return p.bot ? 'BOT' : Number.isFinite(p.pingMs) ? Math.round(p.pingMs) + ' ms' : 'Measuring…';
  }
  function membersMarkup() {
    const host = store.room.hostId === connection.id,
      me = member();
    return `<div class="section-head"><h2>The room</h2><span class="label">${store.room.players.length} / 12 MEMBERS</span></div><div class="players-list">${store.room.players.map((p) => `<div class="player-card" data-member="${esc(p.id)}"><canvas class="player-pixel" data-avatar="${esc(p.id)}"></canvas><div class="player-copy"><div class="player-name">${p.bot ? '<span class="member-icon" role="img" aria-label="Bot" title="Bot">🤖</span>' : ''}${p.id === store.room.hostId ? hostIconMarkup() : ''}${esc(p.name)} ${p.id === connection.id ? '<span class="label">YOU</span>' : ''}</div><div class="player-sub">${store.room.settings.teamBattle && p.id !== connection.id && !(host && p.bot) ? (TEAMS.find((t) => t.id === p.team)?.label || '') + ' TEAM · ' : ''}${seatLabel(p)}${store.room.phase === 'playing' && store.room.roundPlayers?.some((q) => q.id === p.id) ? ' · FIGHTING NOW' : ''}${p.bot ? '' : ` · <span data-ping-player="${esc(p.id)}">${pingLabel(p)}</span>`}</div>${teamMarkup(p)}${p.id !== connection.id ? `<div class="player-loadout" aria-label="${esc(p.name)} next loadout">${p.loadout.map((name, index) => movePeekMarkup({ name, index, slots: store.room.settings.moves, armable: roomLibrary().some((move) => move.name === name), esc })).join('')}${host && p.bot ? `<button type="button" class="button small subtle bot-randomize" data-randomize-bot="${esc(p.id)}" aria-label="Randomize ${esc(p.name)}’s next-round moves" title="Randomize next-round moves">RANDOMIZE ↻</button>` : ''}</div>` : ''}</div><span class="player-state ${p.ready ? 'ready' : ''}">${memberStateLabel(p)}</span>${host && p.bot ? `<button class="remove-bot" data-remove-bot="${esc(p.id)}" aria-label="Remove ${esc(p.name)} from the next round" title="Remove from next round">×</button>` : host && p.id !== connection.id ? `<button class="remove-bot kick-player" data-kick-player="${esc(p.id)}" title="Remove ${esc(p.name)} from this room" aria-label="Kick ${esc(p.name)} from this room">KICK</button>` : ''}</div>`).join('')}</div><div class="room-member-actions"><button id="participation" class="button small subtle">${me?.queued === false ? 'JOIN NEXT ROUND →' : 'SPECTATE ONLY'}</button>${host && store.room.players.length < 12 && store.room.players.filter((p) => p.bot).length < 4 ? '<button class="button small subtle" id="add-bot">+ ADD BOT</button>' : ''}</div><p class="helper">Four fighters per round. Waiting players rotate in; humans take priority over bots.</p>${accessMarkup()}${handicapMarkup()}<div class="room-character-editor"><div class="section-head"><h2>Your character</h2><span class="label">FOR THE NEXT ROUND</span></div>${characterEditorMarkup(characterProfile(), { prefix: 'room', team: store.room.settings.teamBattle ? me?.team : null })}</div>${playerSettingsMarkup()}`;
  }
  function teamMarkup(player) {
    if (
      !store.room.settings.teamBattle ||
      (player.id !== connection.id && !(store.room.hostId === connection.id && player.bot))
    )
      return '';
    const mine = player.id === connection.id,
      selectId = mine ? 'player-team' : 'bot-team-' + player.id;
    return `<div class="field team-choice member-team-choice"><label for="${esc(selectId)}">${mine ? 'Your team' : 'Team'} · next round</label><select id="${esc(selectId)}" ${mine ? '' : `data-bot-team="${esc(player.id)}"`} aria-label="${mine ? 'Your' : esc(player.name) + '’s'} team for the next round">${TEAMS.map((t) => `<option value="${t.id}" ${player.team === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>`;
  }
  function handicapMarkup() {
    const handicap = member()?.handicapPercent ?? profileClient.preferences.handicapPercent,
      health = store.room.settings.healthPercent ?? 100;
    return `<div class="room-handicap field"><label for="handicap-percent">YOUR HEALTH HANDICAP</label><select id="handicap-percent">${[
      ...new Set([...Array.from({ length: 10 }, (_, i) => 100 - i * 10), handicap]),
    ]
      .sort((a, b) => b - a)
      .map(
        (value) =>
          `<option value="${value}" ${value === handicap ? 'selected' : ''}>${value}%${value === 100 ? ' · No handicap' : ''}</option>`,
      )
      .join(
        '',
      )}</select><p class="helper">Next game: ${maxHealth(health, handicap)} HP (${health}% room health × ${handicap}% personal health).</p></div>`;
  }
  function settingsMarkup() {
    const host = store.room.hostId === connection.id,
      s = store.room.settings;
    const features = () =>
      getMechanicsVersion(s.mechanicsVersion)?.components
        ? `<fieldset class="field wide feature-toggles"><legend>MOVE FEATURES</legend>${COMPOSED_FEATURES.map(
            (feature) =>
              `<label class="access-checkbox"><input type="checkbox" data-feature="${feature.id}" ${s.disabledFeatures?.includes(feature.id) ? '' : 'checked'} ${host ? '' : 'disabled'}> ${feature.label}</label>`,
          ).join('')}</fieldset>`
        : '';
    return `<div class="section-head"><h2>Next round rules</h2><span class="tag">${host ? 'HOST CONTROLS' : 'SET BY THE HOST'}</span></div>${store.room.phase !== 'lobby' ? '<p class="pending-notice">Changes apply to the next round. The current round is locked.</p>' : ''}${roomSettingsFormMarkup(
      s,
      {
        host,
        custom: {
          features,
          map: () => mapSelectorMarkup(s.stage, !host, s.mechanicsVersion, s.mode),
        },
        // Read before the lobby is replaced, so a re-render keeps the section open.
        advancedOpen: !!$('.advanced-settings')?.open,
      },
    )}`;
  }
  function bindRoomControls() {
    const access = $('#access-form');
    if (access) {
      $('#access-private').onchange = (e) => ($('#access-password').hidden = !e.target.checked);
      access.onsubmit = (e) => {
        e.preventDefault();
        const privacy = $('#access-private').checked,
          password = $('#access-password').value;
        if (privacy && !store.room.private && password.length < PASSWORD_MIN_LENGTH) {
          toast('Choose a room password with 8–64 characters.');
          return;
        }
        send({ type: 'access', private: privacy, ...(privacy && password ? { password } : {}) });
      };
    }
    document.querySelectorAll('[data-avatar]').forEach((c) => {
      const player = store.room.players.find((p) => p.id === c.dataset.avatar);
      if (player) drawAvatar(c, player);
    });
    $('#participation')?.addEventListener('click', () =>
      send({ type: 'participation', queued: member()?.queued === false }),
    );
    $('#add-bot')?.addEventListener('click', () => send({ type: 'addBot' }));
    document
      .querySelectorAll('[data-remove-bot]')
      .forEach((b) => (b.onclick = () => send({ type: 'removeBot', id: b.dataset.removeBot })));
    document
      .querySelectorAll('[data-bot-team]')
      .forEach(
        (select) =>
          (select.onchange = () =>
            send({ type: 'botTeam', id: select.dataset.botTeam, team: select.value })),
      );
    document
      .querySelectorAll('[data-randomize-bot]')
      .forEach(
        (button) =>
          (button.onclick = () => send({ type: 'randomizeBot', id: button.dataset.randomizeBot })),
      );
    document
      .querySelectorAll('[data-kick-player]')
      .forEach(
        (button) => (button.onclick = () => send({ type: 'kick', id: button.dataset.kickPlayer })),
      );
    ready.bind();
    $('#handicap-percent')?.addEventListener('change', (e) => {
      profileClient.setHandicap(Number(e.target.value));
      send({ type: 'handicap', handicapPercent: profileClient.preferences.handicapPercent });
    });
    document.querySelectorAll('[data-setting]').forEach(
      (el) =>
        (el.onchange = () => {
          if (el.type === 'number' && !el.reportValidity()) return;
          profileClient.rememberRules(true);
          if (
            el.dataset.setting === 'mechanicsVersion' &&
            el.value === 'classic' &&
            store.room.settings.mode === 'ctf'
          )
            toast('Classic changes Capture the flag to Most kills.');
          send({
            type: 'settings',
            settings: { [el.dataset.setting]: settingValue(el) },
          });
        }),
    );
    document.querySelectorAll('[data-feature]').forEach(
      (el) =>
        (el.onchange = () => {
          profileClient.rememberRules(true);
          send({
            type: 'settings',
            settings: {
              disabledFeatures: [...document.querySelectorAll('[data-feature]')]
                .filter((box) => !box.checked)
                .map((box) => box.dataset.feature),
            },
          });
        }),
    );
    loadout.bind();
    bindMapSelector(document);
    const editor = document.querySelector('.room-character-editor');
    if (editor)
      bindCharacterEditor(editor, characterProfile(), changeProfile, {
        prefix: 'room',
        team: store.room.settings.teamBattle ? member()?.team : null,
      });
    $('#player-team')?.addEventListener('change', (e) => {
      profileClient.setTeam(e.target.value);
      send({ type: 'team', team: e.target.value });
    });
  }
  function lobbyHeader(title) {
    return `<div class="page-top"><div><button class="back-link" id="leave-room">← LEAVE ROOM</button><h1 class="page-title">${title}</h1></div><div class="page-top-actions">${discordLinkMarkup()}${store.room.practice ? '<span class="tag">SOLO BOT MATCH</span>' : '<div class="room-code"><div><div class="label">' + (store.room.private ? 'PRIVATE' : 'PUBLIC') + ' ROOM</div><strong>' + esc(store.room.code) + '</strong></div><button class="icon-button" id="copy-room" title="Copy invite link" aria-label="Copy invite link">↗</button></div>'}</div></div>`;
  }
  function bindLobbyHeader() {
    $('#leave-room').onclick = leave;
    if ($('#copy-room'))
      $('#copy-room').onclick = async () => {
        const link = new URL(
          serverInvite(
            location.href,
            store.room.code,
            servers.selected?.id || store.room.serverId || 'us-east',
          ),
        );
        try {
          await navigator.clipboard.writeText(link.href);
          toast('Invite link copied. Send it to your friends.');
        } catch {
          toast(`Room code: ${store.room.code}`);
        }
      };
  }
  function builtInControlsMarkup() {
    const keys = profileClient.preferences.builtinHotkeys || {};
    const moves = builtinActionsFor(store.room?.settings.mechanicsVersion)
      .map(
        (action) =>
          `<div class="built-in-move"><kbd data-builtin-kbd="${action}">${keys[action] ? hotkeyLabel(keys[action]) : 'NONE'}</kbd><div><strong>${BUILTIN_LABELS[action]}</strong><span>${BUILTIN_HINTS[action]}</span></div></div>`,
      )
      .join('');
    return `<aside class="built-in-controls" aria-labelledby="built-in-title"><div class="built-in-intro"><h2 id="built-in-title">Built-in moves</h2><p>Every player has these. They don’t use loadout slots; change their keys beside your loadout.</p></div>${moves}</aside>`;
  }
  return {
    selectedPlayers,
    member,
    pingLabel,
    membersMarkup,
    settingsMarkup,
    bind: bindRoomControls,
    header: lobbyHeader,
    bindHeader: bindLobbyHeader,
    builtInControlsMarkup,
  };
}
