export function mount(root, { ui, editor, dock, loadout, ready }) {
  document.body.classList.remove('in-match');
  const saved = editor.capture();
  dock.clear();
  editor.replace(
    root,
    ui.header('Room') +
      ui.builtInControlsMarkup() +
      `<div class="lobby-grid"><div><section class="panel">${ui.membersMarkup()}${loadout.markup()}</section></div><section class="panel">${ui.settingsMarkup()}${ready.markup()}</section></div>`,
  );
  ui.bindHeader();
  ui.bind();
  dock.render();
  editor.restore(saved);
}
export function unmount() {}
