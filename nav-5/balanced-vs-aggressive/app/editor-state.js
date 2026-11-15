/** Preserve editor focus and guard blur handlers while shared room markup changes. */
export function createEditorState() {
  const $ = (selector) => document.querySelector(selector);
  let replacingEditorMarkup = false;
  function guard(callback) {
    const previous = replacingEditorMarkup;
    replacingEditorMarkup = true;
    try {
      return callback();
    } finally {
      replacingEditorMarkup = previous;
    }
  }
  function replaceEditorMarkup(element, html) {
    guard(() => {
      element.innerHTML = html;
    });
  }
  function captureEditor() {
    const el = document.activeElement,
      access = $('.access-controls');
    return {
      focus:
        el && ['INPUT', 'TEXTAREA'].includes(el.tagName)
          ? { id: el.id, value: el.value, start: el.selectionStart, end: el.selectionEnd }
          : null,
      access: access?.open
        ? { private: $('#access-private').checked, password: $('#access-password').value }
        : null,
    };
  }
  function restoreEditor(saved) {
    if (!saved) return;
    if (saved.access && $('.access-controls')) {
      $('.access-controls').open = true;
      $('#access-private').checked = saved.access.private;
      $('#access-password').value = saved.access.password;
      $('#access-password').hidden = !saved.access.private;
    }
    if (!saved.focus) return;
    const { id, value, start, end } = saved.focus,
      el = document.getElementById(id);
    if (el && !el.disabled) {
      el.value = value;
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(start, end);
      } catch {}
    }
  }
  return {
    guard,
    replace: replaceEditorMarkup,
    capture: captureEditor,
    restore: restoreEditor,
    get replacing() {
      return replacingEditorMarkup;
    },
  };
}
