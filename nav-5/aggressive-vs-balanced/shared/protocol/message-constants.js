// Native browser modules cannot resolve zod's bare import. Keep wire constants
// here so forms and dispatch can share them without loading server validation.
// Engine upgrades require matching client renderers and input handling after an update.
export const PROTOCOL_VERSION = 5;
export * from './limits.js';
export { ROOM_SETTING_LIMITS } from './room-settings.js';
