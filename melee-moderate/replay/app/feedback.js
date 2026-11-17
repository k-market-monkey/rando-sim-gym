// The feedback tab: a fixed bottom-left button that opens a text box and posts
// the note to the server the player is using. Mount once; it lives outside #app
// so screen changes do not reset a half-written note.
import { useStylesheet } from './use-stylesheet.js';

export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * @param {{ context?: () => { origin?: string, page?: string, room?: string | null } }} options
 * `context` is read when the note is sent: the server origin, the current screen
 * and the room code, if any.
 */
export function mountFeedback({ context = () => ({}) } = {}) {
  useStylesheet('/feedback.css');
  const root = document.createElement('aside');
  root.className = 'feedback';
  root.innerHTML = `<button type="button" class="feedback-tab" aria-expanded="false" aria-controls="feedback-panel">FEEDBACK</button><form id="feedback-panel" class="feedback-panel" hidden><label for="feedback-text">What should we fix or add?</label><textarea id="feedback-text" maxlength="${FEEDBACK_MAX_LENGTH}" rows="5" required></textarea><div class="feedback-row"><span class="feedback-count" aria-live="off">0 / ${FEEDBACK_MAX_LENGTH}</span><button type="button" class="button small subtle feedback-close">CLOSE</button><button type="submit" class="button small primary feedback-send">SEND</button></div><p class="feedback-status" role="status"></p></form>`;
  document.body.append(root);
  const tab = root.querySelector('.feedback-tab'),
    form = root.querySelector('form'),
    text = root.querySelector('textarea'),
    count = root.querySelector('.feedback-count'),
    send = root.querySelector('.feedback-send'),
    status = root.querySelector('.feedback-status');
  const open = (value) => {
    form.hidden = !value;
    tab.setAttribute('aria-expanded', String(value));
    root.classList.toggle('open', value);
    if (value) text.focus();
  };
  const say = (message, kind = '') => {
    status.textContent = message;
    status.dataset.kind = kind;
  };
  tab.onclick = () => open(form.hidden);
  root.querySelector('.feedback-close').onclick = () => open(false);
  text.oninput = () => {
    count.textContent = `${text.value.length} / ${FEEDBACK_MAX_LENGTH}`;
    say('');
  };
  // Typing a note must not cast moves, dash or pause the game.
  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      open(false);
      tab.focus();
    }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const note = text.value.trim();
    if (!note) return say('Write a note first.', 'error');
    const { origin = '', page, room } = context();
    send.disabled = true;
    say('Sending…');
    try {
      const response = await fetch(origin + '/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: note, page, room: room || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || 'Feedback could not be sent.');
      text.value = '';
      count.textContent = `0 / ${FEEDBACK_MAX_LENGTH}`;
      say('Thanks! Your note was sent.', 'ok');
    } catch (error) {
      say(error instanceof TypeError ? 'Feedback could not be sent.' : error.message, 'error');
    } finally {
      send.disabled = false;
      // Disabling the button dropped focus to the page; return it so typing
      // and Escape still reach the panel rather than the game.
      if (!form.hidden) text.focus();
    }
  };
  return { root, open };
}
