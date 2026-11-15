// Internal calibration arena. Geometry has 180-degree rotational symmetry.
export const SIMULATION_MAP_V1 = {
  id: 'balance-foundry',
  name: 'Balance Foundry',
  revision: 1,
  engines: ['classic', 'composed'],
  simulationOnly: true,
  supportedModes: ['simulation'],
  width: 720,
  height: 480,
  theme: 'foundry',
  description: 'A compact, symmetric arena for calibration duels.',
  walls: [
    { x: 280, y: 120, w: 40, h: 120 },
    { x: 400, y: 240, w: 40, h: 120 },
  ],
  spawnSets: {
    2: [
      [100, 240],
      [620, 240],
    ],
    3: [
      [100, 100],
      [620, 380],
      [620, 100],
    ],
    4: [
      [100, 100],
      [620, 380],
      [620, 100],
      [100, 380],
    ],
  },
  respawnCandidates: [
    [100, 100],
    [620, 380],
    [620, 100],
    [100, 380],
    [100, 240],
    [620, 240],
  ],
};

// Ten 40-unit tiles per side. Keep revision 1 available for recorded duels.
export const SIMULATION_MAP = {
  ...SIMULATION_MAP_V1,
  revision: 2,
  width: 400,
  height: 400,
  walls: [
    { x: 160, y: 100, w: 40, h: 80 },
    { x: 200, y: 220, w: 40, h: 80 },
  ],
  spawnSets: {
    2: [
      [80, 200],
      [320, 200],
    ],
    3: [
      [80, 80],
      [320, 320],
      [320, 80],
    ],
    4: [
      [80, 80],
      [320, 320],
      [320, 80],
      [80, 320],
    ],
  },
  respawnCandidates: [
    [80, 80],
    [320, 320],
    [320, 80],
    [80, 320],
    [80, 200],
    [320, 200],
  ],
};
