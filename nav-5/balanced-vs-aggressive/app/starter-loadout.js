// Moves a first-time player starts a practice match with. Every name must be a
// seed move of its engine, so it exists before anything has been generated
// (tests/starter-loadout.test.js checks this).
export const STARTER_LOADOUTS = Object.freeze({
  classic: Object.freeze(['star shot', 'scatter burst', 'laser noodle']),
  composed: Object.freeze(['arc blade', 'pepper stream', 'twin wire']),
});
export const starterLoadout = (version) => STARTER_LOADOUTS[version] || [];
