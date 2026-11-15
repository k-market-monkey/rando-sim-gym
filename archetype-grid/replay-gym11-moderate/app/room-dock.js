import { CHAT_LENGTH } from '../shared/protocol/message-constants.js';
export function createRoomDock({
  app,
  store,
  ui,
  loadout,
  ready,
  editor,
  send,
  clearControls,
  esc,
}) {
  const $ = (selector) => document.querySelector(selector);
  let dockOpen = false,
    dockTab = 'chat',
    chatDraft = '',
    unreadChat = 0;
  const dock = document.createElement('aside');
  dock.id = 'room-dock';
  app.after(dock);
  function chatMarkup() {
    return `<section class="room-chat"><div class="section-head"><h2>Room chat</h2><span class="label">EVERYONE IN THIS ROOM</span></div><div id="chat-messages" class="chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div><form id="chat-form" class="chat-form"><label class="sr-only" for="chat-input">Message the room</label><input id="chat-input" maxlength="${CHAT_LENGTH}" autocomplete="off" placeholder="Message the room…" value="${esc(chatDraft)}"><button class="button small primary" type="submit">SEND ↗</button></form><p class="helper">Up to ${CHAT_LENGTH} characters. Recent messages are shared with new arrivals.</p></section>`;
  }
  function renderChatMessages() {
    const el = $('#chat-messages');
    if (!el) return;
    const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const messages = store.room?.chat || [];
    const known = new Set(
      [...el.querySelectorAll('[data-message-id]')].map((e) => e.dataset.messageId),
    );
    if (!messages.length) {
      if (!el.children.length) el.innerHTML = '<p class="chat-empty">No messages yet.</p>';
      return;
    }
    el.querySelector('.chat-empty')?.remove();
    for (const message of messages)
      if (!known.has(String(message.id))) {
        const row = document.createElement('div');
        row.className = 'chat-message';
        row.dataset.messageId = String(message.id);
        row.innerHTML = `<div class="chat-meta"><strong>${esc(message.name)}</strong><time>${esc(new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time></div><p>${esc(message.text)}</p>`;
        el.append(row);
      }
    const live = new Set(messages.map((m) => String(m.id)));
    for (const child of [...el.children]) if (!live.has(child.dataset.messageId)) child.remove();
    if (stick) el.scrollTop = el.scrollHeight;
  }
  function bindChat() {
    const form = $('#chat-form');
    if (!form) return;
    const input = $('#chat-input');
    input.oninput = () => (chatDraft = input.value);
    input.onfocus = clearControls;
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      send({ type: 'chat', text });
      chatDraft = '';
      input.value = '';
      input.focus();
    };
    renderChatMessages();
    const list = $('#chat-messages');
    list.scrollTop = list.scrollHeight;
  }
  function chatIsVisible() {
    return (
      dockOpen &&
      dockTab === 'chat' &&
      document.visibilityState !== 'hidden' &&
      !!$('#chat-messages')
    );
  }
  function unreadBadge() {
    return unreadChat
      ? `<span class="chat-unread-count" aria-hidden="true">${unreadChat}</span>`
      : '';
  }
  function updateDockButton() {
    const unreadLabel = unreadChat
      ? `, ${unreadChat} unread room message${unreadChat === 1 ? '' : 's'}`
      : '';
    const button = $('#room-panel-toggle');
    if (button) {
      const label = dockOpen
        ? dockTab === 'chat'
          ? 'CLOSE CHAT ×'
          : 'CLOSE ROOM ×'
        : `${unreadChat ? 'NEW CHAT' : 'CHAT'}${store.view === 'lobby' ? '' : ' & ROOM'} ↗`;
      button.innerHTML = `<span>${label}</span>${unreadBadge()}`;
      button.classList.toggle('has-unread', unreadChat > 0);
      button.setAttribute('aria-label', label + unreadLabel);
      button.setAttribute('aria-expanded', String(dockOpen));
    }
    const chatTab = $('[data-room-tab="chat"]');
    if (chatTab) {
      chatTab.innerHTML = `CHAT${unreadBadge()}`;
      chatTab.classList.toggle('has-unread', unreadChat > 0);
      chatTab.setAttribute('aria-label', 'Chat' + unreadLabel);
    }
  }
  const onVisibilityChange = () => {
    if (chatIsVisible()) {
      renderChatMessages();
      unreadChat = 0;
      updateDockButton();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  function positionRoomDock() {
    const hud =
      store.view === 'match'
        ? document.querySelector('.match-hud:not([hidden]),.spectator-hud:not([hidden])')
        : null;
    if (!hud) {
      dock.style.removeProperty('--chat-bottom');
      return;
    }
    const top = hud.getBoundingClientRect().top,
      bottom = top > 100 && top < innerHeight ? Math.max(12, innerHeight - top + 8) : 16;
    const value = Math.round(bottom) + 'px';
    if (dock.style.getPropertyValue('--chat-bottom') !== value)
      dock.style.setProperty('--chat-bottom', value);
  }
  const onResize = () => requestAnimationFrame(positionRoomDock);
  window.addEventListener('resize', onResize);
  function openRoomPanel(tab = 'chat') {
    dockTab = tab;
    dockOpen = true;
    clearControls();
    renderDock();
  }
  function renderDock() {
    positionRoomDock();
    if (store.view === 'lobby') dockTab = 'chat';
    const oldScroll = $('.room-panel-content')?.scrollTop || 0;
    if (!store.room || store.view === 'home') {
      dock.replaceChildren();
      return;
    }
    const saved = editor.capture();
    dock.className =
      (dockOpen ? 'is-open ' : '') + (dockTab === 'chat' ? 'chat-dock' : 'tools-dock');
    editor.replace(
      dock,
      `<button id="room-panel-toggle" class="button small room-panel-toggle" aria-controls="room-panel" aria-expanded="${dockOpen}"></button>${
        dockOpen
          ? `<section id="room-panel" class="room-panel" aria-label="Room lobby"><div class="drawer-heading"><div><span class="label">${store.room.practice ? 'SOLO BOT MATCH' : (store.room.private ? 'PRIVATE' : 'PUBLIC') + ' ROOM ' + esc(store.room.code)}</span><h2>${dockTab === 'chat' ? 'Room chat' : 'Room tools'}</h2></div><button id="drawer-close" class="icon-button" aria-label="Close room panel">×</button></div><div class="room-tabs" role="tablist" aria-label="Room tools">${(store.view ===
            'lobby'
              ? []
              : [
                  ['chat', 'CHAT'],
                  ['next', 'NEXT ROUND'],
                  ['people', 'PEOPLE'],
                ]
            )
              .map(
                ([tab, label]) =>
                  `<button role="tab" aria-selected="${dockTab === tab}" data-room-tab="${tab}" class="${dockTab === tab ? 'active' : ''}">${label}</button>`,
              )
              .join(
                '',
              )}</div><div class="room-panel-content">${dockTab === 'chat' ? chatMarkup() : dockTab === 'next' ? ui.settingsMarkup() + loadout.markup() + ready.markup() : ui.membersMarkup()}</div></section>`
          : ''
      }`,
    );
    updateDockButton();
    $('#room-panel-toggle').onclick = () => {
      dockOpen = !dockOpen;
      clearControls();
      renderDock();
      if (!dockOpen) $('#game-canvas')?.focus();
    };
    $('#drawer-close')?.addEventListener('click', () => {
      dockOpen = false;
      renderDock();
      $('#game-canvas')?.focus();
    });
    document.querySelectorAll('[data-room-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          dockTab = b.dataset.roomTab;
          clearControls();
          renderDock();
        }),
    );
    if (dockOpen) {
      if (dockTab === 'chat') {
        bindChat();
        if (chatIsVisible()) unreadChat = 0;
        updateDockButton();
      } else ui.bind();
    }
    if ($('.room-panel-content')) $('.room-panel-content').scrollTop = oldScroll;
    editor.restore(saved);
  }
  return {
    get isOpen() {
      return dockOpen;
    },
    render: renderDock,
    position: positionRoomDock,
    open: openRoomPanel,
    receiveChat() {
      if (!chatIsVisible()) unreadChat++;
    },
    refreshChat() {
      renderChatMessages();
      updateDockButton();
    },
    resetRoom() {
      chatDraft = '';
      unreadChat = 0;
      dockOpen = false;
      dockTab = 'chat';
    },
    leave() {
      dockOpen = false;
      chatDraft = '';
    },
    hide() {
      dockOpen = false;
      dock.replaceChildren();
    },
    clear() {
      dock.replaceChildren();
    },
    close() {
      dockOpen = false;
      clearControls();
      renderDock();
      $('#game-canvas')?.focus();
    },
    dispose() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      dock.remove();
    },
  };
}
