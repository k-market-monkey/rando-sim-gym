// Internal calibration arena. Geometry has 180-degree rotational symmetry.
export const SIMULATION_MAP = {
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
