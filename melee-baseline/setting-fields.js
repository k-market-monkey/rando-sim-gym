// Attach a default and a one-field reset to an existing labelled control.
export function settingField(input, defaultValue, accessibleName) {
  const label = input.closest('label');
  const wrap = document.createElement('div');
  wrap.className = 'setting-field';
  label.replaceWith(wrap);
  const footer = document.createElement('div');
  footer.className = 'field-meta';
  const hint = document.createElement('small');
  hint.id = input.id + '-default';
  input.setAttribute('aria-describedby', hint.id);
  const display = input.options
    ? Array.from(input.options).find((o) => o.value === String(defaultValue)).textContent
    : typeof defaultValue === 'boolean'
      ? defaultValue
        ? 'On'
        : 'Off'
      : String(defaultValue);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.setAttribute('aria-label', 'Reset ' + accessibleName + ' to ' + display);
  reset.onclick = () => {
    if (input.type === 'checkbox') input.checked = defaultValue;
    else input.value = defaultValue;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  };
  footer.append(hint, reset);
  wrap.append(label, footer);
  return () => {
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const modified = String(value) !== String(defaultValue);
    wrap.classList.toggle('overridden', modified);
    hint.textContent = (modified ? 'Override · default ' : 'Default ') + display;
    reset.hidden = !modified;
    return modified;
  };
}
export function overrides(values, baseline) {
  const changes = {};
  for (const [key, value] of Object.entries(values)) {
    if (value && typeof value === 'object') {
      const nested = overrides(value, baseline[key]);
      if (Object.keys(nested).length) changes[key] = nested;
    } else if (value !== baseline[key]) changes[key] = value;
  }
  return changes;
}
