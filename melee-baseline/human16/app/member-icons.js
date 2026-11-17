// Pixel-art icons for the lobby player list, drawn on the same grid style as
// the fighters (public/renderer.js). Each row is one line of pixels; a digit
// picks a colour from the palette, '.' is empty.
const PALETTE = { 1: '#f3bf59', 2: '#f574a5', 3: '#7a5a1f' };
const CROWN = ['1..1..1', '11.1.11', '1111111', '1212121', '3333333'];

function pixelSvg(rows, scale) {
  const width = rows[0].length,
    height = rows.length;
  const rects = rows.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      PALETTE[cell]
        ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[cell]}"/>`]
        : [],
    ),
  );
  return `<svg class="pixel-icon" viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
}

/** The room owner's mark in the lobby player list. */
export function hostIconMarkup() {
  return `<span class="member-icon" role="img" aria-label="Room owner" title="Room owner">${pixelSvg(CROWN, 2)}</span>`;
}
