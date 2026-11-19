import { verifiedRecording } from './recorded-stats.js?v=30';
self.onmessage = async ({ data }) => {
  try {
    const stats = [];
    for (const game of data) stats.push((await verifiedRecording(game)).stats);
    self.postMessage({ stats });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
