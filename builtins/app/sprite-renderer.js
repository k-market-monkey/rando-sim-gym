export function pixelSprite(ctx, rows, x, y, scale, colors) {
  for (let j = 0; j < rows.length; j++)
    for (let i = 0; i < rows[j].length; i++) {
      const c = colors[Number(rows[j][i])];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), scale, scale);
      }
    }
}
