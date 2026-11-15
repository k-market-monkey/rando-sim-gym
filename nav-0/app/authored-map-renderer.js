import { getStateMap } from '/rando-sim-gym/nav-0/shared/sim/map-state.js';
import { arenaSize } from './arena-size.js';

const palettes = {
  'perimeter-foundry': {
    void: '#11171c',
    floor: '#344047',
    grid: '#404d53',
    edge: '#8c989d',
    cover: '#56636b',
    trim: '#bdc7c9',
  },
  'split-rooftops': {
    void: '#101b2c',
    floor: '#71818d',
    grid: '#7c8b95',
    edge: '#c5d1d6',
    cover: '#3e5565',
    trim: '#afc7cf',
  },
  'ice-bowl': {
    void: '#183748',
    floor: '#759bad',
    grid: '#85acba',
    edge: '#d5e7e9',
    cover: '#8fa8af',
    trim: '#e0e9e8',
  },
  'winding-canyon': {
    void: '#2c2020',
    floor: '#9c7958',
    grid: '#a7825c',
    edge: '#d5af7c',
    cover: '#72543d',
    trim: '#ca9967',
  },
  turntable: {
    void: '#172026',
    floor: '#485355',
    grid: '#53615e',
    edge: '#a0a897',
    cover: '#59665d',
    trim: '#c4caa9',
  },
  'overgrown-garden': {
    void: '#142b28',
    floor: '#4e6b50',
    grid: '#597659',
    edge: '#afc19b',
    cover: '#345743',
    trim: '#92b478',
  },
  breakwater: {
    void: '#0d2d3e',
    floor: '#536e77',
    grid: '#607d84',
    edge: '#c1d0c4',
    cover: '#354b54',
    trim: '#b9c4b2',
  },
  'sunken-court': {
    void: '#302b31',
    floor: '#937c66',
    grid: '#a18a72',
    edge: '#d0b497',
    cover: '#614e48',
    trim: '#c4a48b',
  },
  'harbour-yard': {
    void: '#0f2a3a',
    floor: '#6d7271',
    grid: '#787d7b',
    edge: '#c9c7b8',
    cover: '#46504f',
    trim: '#b8b19a',
  },
  'grand-causeway': {
    void: '#0e3340',
    floor: '#86806a',
    grid: '#928b73',
    edge: '#d6cdb0',
    cover: '#5a5545',
    trim: '#c8bb94',
  },
};
// Eight arena-sized RGBA ground layers use ~19 MiB at the default size and at most ~44 MiB
// at the largest; dynamic terrain is never cached.
const groundLayers = new Map();
function drawGround(ctx, map, palette) {
  let canvas = groundLayers.get(map);
  if (!canvas) {
    canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(map.width, map.height)
        : document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const layer = canvas.getContext('2d');
    layer.imageSmoothingEnabled = false;
    backdrop(layer, map, palette);
    layer.save();
    layer.translate(0, 8);
    edgePath(layer, map);
    layer.strokeStyle = '#050b1299';
    layer.lineWidth = 15;
    layer.stroke();
    layer.restore();
    floorTexture(layer, map, palette);
    if (groundLayers.size >= 8) groundLayers.delete(groundLayers.keys().next().value);
    groundLayers.set(map, canvas);
  } else {
    groundLayers.delete(map);
    groundLayers.set(map, canvas);
  }
  ctx.drawImage(canvas, 0, 0);
}
function floorPath(ctx, map) {
  ctx.beginPath();
  for (let y = 0; y < map.floorMask.length; y++)
    for (let x = 0; x < map.floorMask[y].length; x++)
      if (map.floorMask[y]?.[x] === '#') ctx.rect(x * 40, y * 40, 40, 40);
}
function edgePath(ctx, map) {
  ctx.beginPath();
  for (let y = 0; y < map.floorMask.length; y++)
    for (let x = 0; x < map.floorMask[y].length; x++)
      if (map.floorMask[y]?.[x] === '#')
        for (const [dx, dy, ax, ay, bx, by] of [
          [0, -1, 0, 0, 40, 0],
          [1, 0, 40, 0, 40, 40],
          [0, 1, 40, 40, 0, 40],
          [-1, 0, 0, 40, 0, 0],
        ])
          if (map.floorMask[y + dy]?.[x + dx] !== '#') {
            ctx.moveTo(x * 40 + ax, y * 40 + ay);
            ctx.lineTo(x * 40 + bx, y * 40 + by);
          }
}
function backdrop(ctx, map, palette) {
  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, map.width, map.height);
  if (map.id === 'split-rooftops') {
    for (let y = 0; y < map.height; y += 100)
      for (let x = 0; x < map.width; x += 112) {
        const offset = ((x / 112 + y / 100) % 2) * 23;
        ctx.fillStyle = '#152436';
        ctx.fillRect(x + offset, y, 78, 84);
        ctx.fillStyle = '#223448';
        ctx.fillRect(x + offset + 3, y + 3, 72, 3);
        for (let dy = 15; dy < 76; dy += 16)
          for (let dx = 12; dx < 68; dx += 17) {
            ctx.fillStyle = (dx + dy + x) % 3 ? '#2c4354' : '#4e574c';
            ctx.fillRect(x + offset + dx, y + dy, 5, 4);
          }
      }
  } else if (map.id === 'breakwater') {
    for (let y = 14; y < map.height; y += 25) {
      ctx.strokeStyle = y % 2 ? '#17485a' : '#215365';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 20) {
        const yy = y + Math.sin(x * 0.025 + y) * 3;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (map.id === 'sunken-court') {
    ctx.strokeStyle = '#453a3a';
    ctx.lineWidth = 2;
    for (let y = 0; y < map.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
      ctx.stroke();
      for (let x = y % 80 ? 20 : 0; x < map.width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 40);
        ctx.stroke();
      }
    }
  } else if (map.id === 'ice-bowl') {
    ctx.strokeStyle = '#295064';
    ctx.lineWidth = 2;
    for (let y = 12; y < map.height; y += 27) {
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 24) {
        const yy = y + Math.sin((x + y) * 0.03) * 4;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (map.id === 'winding-canyon') {
    for (let y = 8; y < map.height; y += 32) {
      ctx.strokeStyle = y % 64 ? '#51372a' : '#3d2b25';
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 40) {
        const yy = y + Math.sin(x * 0.013 + y) * 12;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (map.id === 'overgrown-garden') {
    for (let y = 14; y < map.height; y += 44)
      for (let x = 15; x < map.width; x += 46) {
        ctx.fillStyle = (x + y) % 3 ? '#203c31' : '#294735';
        ctx.beginPath();
        ctx.arc(x + (y % 3) * 5, y, 12 + ((x + y) % 9), 0, Math.PI * 2);
        ctx.fill();
      }
  } else {
    ctx.strokeStyle = '#2b3439';
    ctx.lineWidth = 2;
    for (let x = 10; x < map.width; x += 70) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.height);
      ctx.stroke();
    }
    for (let y = 10; y < map.height; y += 70) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
      ctx.stroke();
    }
  }
}
function floorTexture(ctx, map, palette) {
  floorPath(ctx, map);
  ctx.fillStyle = palette.floor;
  ctx.fill();
  ctx.save();
  floorPath(ctx, map);
  ctx.clip();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let y = 0; y <= map.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(map.width, y);
    ctx.stroke();
  }
  for (let x = 0; x <= map.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, map.height);
    ctx.stroke();
  }
  if (map.id === 'ice-bowl') {
    ctx.strokeStyle = '#d3e6e52b';
    for (let y = 18; y < map.height; y += 33)
      for (let x = 17; x < map.width; x += 77) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 24, y - 8);
        ctx.stroke();
      }
    ctx.strokeStyle = '#305d705c';
    ctx.lineWidth = 2;
    for (const [x, y] of [
      [225, 130],
      [680, 160],
      [230, 470],
      [655, 495],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x - 38, y - 25);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 40, y + 13);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 13, y - 21);
      ctx.stroke();
    }
  } else if (map.id === 'split-rooftops') {
    ctx.strokeStyle = '#4d63745e';
    ctx.lineWidth = 2;
    for (let y = 80; y < map.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
      ctx.stroke();
    }
  } else if (map.id === 'winding-canyon' || map.id === 'overgrown-garden') {
    for (let y = 15; y < map.height; y += 41)
      for (let x = 10; x < map.width; x += 53) {
        ctx.fillStyle = (x + y) % 3 ? '#d7bc831f' : '#172f2724';
        ctx.fillRect(x + (y % 17), y, 3 + (x % 3), 2);
      }
  }
  ctx.restore();
  edgePath(ctx, map);
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 3;
  ctx.stroke();
}
function arrow(ctx, x, y, angle, color = '#e1b85d', scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#10191e';
  ctx.lineWidth = 7 * scale;
  ctx.beginPath();
  ctx.moveTo(-7 * scale, -9 * scale);
  ctx.lineTo(4 * scale, 0);
  ctx.lineTo(-7 * scale, 9 * scale);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * scale;
  ctx.stroke();
  ctx.restore();
}
function perimeter(ctx, c, time) {
  const { x, y, w, h } = c,
    inset = c.inset || 80,
    half = inset / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
  ctx.clip('evenodd');
  ctx.fillStyle = '#263138';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#566167';
  ctx.lineWidth = 2;
  const phase = (time * (c.speed || 1.8)) % 20;
  for (let n = -20; n < w + 20; n += 20) {
    ctx.beginPath();
    ctx.moveTo(x + n + phase, y + 4);
    ctx.lineTo(x + n + phase, y + inset - 4);
    ctx.moveTo(x + n - phase, y + h - inset + 4);
    ctx.lineTo(x + n - phase, y + h - 4);
    ctx.stroke();
  }
  for (let n = -20; n < h + 20; n += 20) {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + n - phase);
    ctx.lineTo(x + inset - 4, y + n - phase);
    ctx.moveTo(x + w - inset + 4, y + n + phase);
    ctx.lineTo(x + w - 4, y + n + phase);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b7924b';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.strokeRect(x + inset - 3, y + inset - 3, w - 2 * inset + 6, h - 2 * inset + 6);
  for (let n = inset + 35; n < w - inset; n += 100) {
    arrow(ctx, x + n, y + half, 0);
    arrow(ctx, x + w - n, y + h - half, Math.PI);
  }
  for (let n = inset + 25; n < h - inset; n += 100) {
    arrow(ctx, x + w - half, y + n, Math.PI / 2);
    arrow(ctx, x + half, y + h - n, -Math.PI / 2);
  }
  for (const [xx, yy, a] of [
    [x + w - half, y + half, Math.PI / 4],
    [x + w - half, y + h - half, Math.PI * 0.75],
    [x + half, y + h - half, Math.PI * 1.25],
    [x + half, y + half, Math.PI * 1.75],
  ]) {
    ctx.fillStyle = '#303d43';
    ctx.beginPath();
    ctx.arc(xx, yy, 24, 0, Math.PI * 2);
    ctx.fill();
    arrow(ctx, xx, yy, a);
  }
  ctx.restore();
}
function rotation(ctx, c, time, state) {
  const x = c.x,
    y = c.y,
    r = c.radius,
    period = c.period || 240,
    phase =
      ((state.preview
        ? time % period
        : (state.map?.controllers?.find?.((item) => item.id === c.id)?.phase ?? time % period)) /
        period) *
      Math.PI *
      2;
  ctx.fillStyle = '#625c44';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c0ac70';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(phase);
  ctx.strokeStyle = '#928159';
  ctx.lineWidth = 2;
  for (const radius of [r * 0.32, r * 0.66, r - 12]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
    ctx.lineTo(Math.cos(a) * (r - 16), Math.sin(a) * (r - 16));
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    arrow(ctx, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, a + Math.PI / 2, '#d2b974', 0.8);
  }
  ctx.restore();
  ctx.fillStyle = '#c7b17b';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
}
function solid(ctx, r, map, palette, breakable = false) {
  const hedge = r.material === 'hedge',
    wood = r.material === 'wood',
    rock = r.material === 'rock' || map.id === 'winding-canyon',
    health = Math.max(0, Math.min(1, (r.hp ?? 1) / (r.maxHp || r.hp || 1)));
  if (breakable && !r.solid) {
    ctx.fillStyle = hedge ? '#355d3f66' : '#5a42384d';
    for (const [dx, dy] of [
      [0.18, 0.28],
      [0.62, 0.2],
      [0.35, 0.7],
      [0.8, 0.66],
    ])
      ctx.fillRect(r.x + dx * r.w - 4, r.y + dy * r.h - 3, 8, 6);
    return;
  }
  ctx.fillStyle = hedge ? '#2c4937' : palette.cover;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = r.pendingDestroy
    ? '#f3d896'
    : breakable
      ? hedge
        ? '#98ba75'
        : '#ddad73'
      : palette.trim;
  ctx.lineWidth = breakable ? 3 : 2;
  ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
  if (wood) {
    ctx.fillStyle = '#987146';
    ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    ctx.strokeStyle = '#523e2b';
    ctx.lineWidth = 3;
    for (let y = 14; y < r.h - 4; y += 13) {
      ctx.beginPath();
      ctx.moveTo(r.x + 5, r.y + y);
      ctx.lineTo(r.x + r.w - 5, r.y + y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#e0bb73';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(r.x + 8, r.y + 9);
    ctx.lineTo(r.x + r.w - 8, r.y + r.h - 9);
    ctx.stroke();
  } else if (hedge) {
    for (let y = 9; y < r.h - 3; y += 16)
      for (let x = 9; x < r.w - 3; x += 17) {
        ctx.fillStyle = (x + y) % 3 ? '#4d794d' : '#608b52';
        ctx.beginPath();
        ctx.arc(r.x + x, r.y + y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (rock) {
    ctx.fillStyle = breakable ? '#a17c54' : '#87684c';
    ctx.beginPath();
    ctx.moveTo(r.x + 7, r.y + 10);
    ctx.lineTo(r.x + r.w * 0.55, r.y + 5);
    ctx.lineTo(r.x + r.w - 8, r.y + r.h * 0.38);
    ctx.lineTo(r.x + r.w - 12, r.y + r.h - 8);
    ctx.lineTo(r.x + 5, r.y + r.h - 12);
    ctx.closePath();
    ctx.fill();
  } else if (map.id === 'overgrown-garden') {
    if (r.h > r.w) {
      ctx.fillStyle = '#a48b65';
      ctx.fillRect(r.x + r.w / 2 - 5, r.y + 20, 10, r.h - 25);
      ctx.fillStyle = '#54735a';
      ctx.fillRect(r.x + 5, r.y + 7, r.w - 10, r.h - 24);
      ctx.fillStyle = '#86a473';
      for (const [dx, dy] of [
        [0.3, 0.2],
        [0.65, 0.3],
        [0.35, 0.48],
        [0.63, 0.63],
      ]) {
        ctx.beginPath();
        ctx.arc(r.x + r.w * dx, r.y + r.h * dy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#b5b68a';
      ctx.fillRect(r.x + r.w / 2 - 4, r.y + r.h - 17, 8, 10);
    } else {
      ctx.fillStyle = '#969d88';
      ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
      ctx.strokeStyle = '#616e60';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r.x + 8, r.y + r.h - 9);
      ctx.lineTo(r.x + r.w * 0.55, r.y + r.h * 0.45);
      ctx.lineTo(r.x + r.w - 8, r.y + 7);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = map.id === 'split-rooftops' ? '#627887' : '#6a767a';
    ctx.fillRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14);
    ctx.strokeStyle = '#253c47';
    for (let y = 13; y < r.h - 10; y += 10) {
      ctx.beginPath();
      ctx.moveTo(r.x + 13, r.y + y);
      ctx.lineTo(r.x + r.w - 13, r.y + y);
      ctx.stroke();
    }
    ctx.fillStyle = palette.trim;
    ctx.fillRect(r.x + 6, r.y + 6, 4, 4);
    ctx.fillRect(r.x + r.w - 10, r.y + r.h - 10, 4, 4);
  }
  if (breakable) {
    ctx.strokeStyle = r.pendingDestroy ? '#fff3c2' : hedge ? '#c7d7a3' : '#34261e';
    ctx.lineWidth = health < 0.5 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.5, r.y + 5);
    ctx.lineTo(r.x + r.w * 0.34, r.y + r.h * 0.37);
    ctx.lineTo(r.x + r.w * 0.61, r.y + r.h * 0.6);
    ctx.lineTo(r.x + r.w * 0.43, r.y + r.h - 5);
    ctx.stroke();
    if (health < 1) {
      ctx.fillStyle = '#202c25';
      ctx.fillRect(r.x + 5, r.y + r.h - 8, r.w - 10, 3);
      ctx.fillStyle = '#d8c78a';
      ctx.fillRect(r.x + 5, r.y + r.h - 8, (r.w - 10) * health, 3);
    }
  }
}
function objectives(ctx, state) {
  const { width, height } = arenaSize(state);
  ctx.strokeStyle = state.mode === 'hill' ? '#e6ef9c' : '#d6decc32';
  ctx.lineWidth = state.mode === 'hill' ? 2 : 1;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 75, 0, Math.PI * 2);
  if (state.mode === 'hill') {
    ctx.fillStyle = '#ebed8e19';
    ctx.fill();
    ctx.setLineDash([8, 8]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#ecf0c785';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 7, height / 2);
  ctx.lineTo(width / 2 + 7, height / 2);
  ctx.moveTo(width / 2, height / 2 - 7);
  ctx.lineTo(width / 2, height / 2 + 7);
  ctx.stroke();
}
/** New silhouettes render their own complete ground plane; the original five maps keep their original drawing path. */
export function drawAuthoredMap(ctx, state, time = state.tick || 0) {
  const palette = palettes[state.stage];
  if (!palette) return false;
  const map = getStateMap(state);
  if (!map.floorMask) return false;
  ctx.save();
  drawGround(ctx, map, palette);
  ctx.save();
  floorPath(ctx, map);
  ctx.clip();
  for (const c of map.controllers || []) {
    if (c.kind === 'perimeter') perimeter(ctx, c, time);
    if (c.kind === 'rotation') rotation(ctx, c, time, state);
  }
  for (const s of map.surfaces || [])
    if (s.kind === 'grip' || s.kind === 'rough') {
      ctx.fillStyle = '#c1b998';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = '#4b635e';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);
      ctx.setLineDash([]);
    }
  ctx.restore();
  for (const wall of map.walls) solid(ctx, wall, map, palette);
  for (const object of state.map?.objects || []) solid(ctx, object, map, palette, true);
  objectives(ctx, state);
  ctx.restore();
  return true;
}

/** Monochrome authoring view, shared by the layout review artifacts. */
export function drawMapGraybox(ctx, map, { routes = [], floorOnly = false } = {}) {
  ctx.save();
  ctx.fillStyle = '#121619';
  ctx.fillRect(0, 0, map.width, map.height);
  floorPath(ctx, map);
  ctx.fillStyle = '#d1d5d5';
  ctx.fill();
  if (!floorOnly) {
    for (const r of map.walls) {
      ctx.fillStyle = '#545d63';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const r of map.objects) {
      ctx.fillStyle = '#919a9e';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#313b43';
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      ctx.setLineDash([]);
    }
  }
  for (const [index, route] of routes.entries()) {
    ctx.strokeStyle = ['#246b94', '#a26d1d', '#7b448e'][index % 3];
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [i, [x, y]] of route.entries()) i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    ctx.stroke();
  }
  if (!floorOnly)
    for (const [x, y] of map.spawnSets[4]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#313b43';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  ctx.restore();
}
