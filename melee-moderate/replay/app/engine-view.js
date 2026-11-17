import { getMechanicsVersion, LEGACY_MECHANICS_VERSION } from '../shared/protocol/versions.js';
import { drawEntity, abilityStatusMarkup as classicAbilityStatus } from './classic-renderer.js';
import {
  drawComposedEntity,
  drawComposedTelegraphs,
  abilityStatusMarkup as composedAbilityStatus,
} from './composed-renderer.js';

export const ENGINE_VIEW = Object.freeze({
  classic: Object.freeze({
    drawEntity,
    drawTelegraphs: null,
    abilityStatus: classicAbilityStatus,
    pressQueue: false,
  }),
  composed: Object.freeze({
    drawEntity: drawComposedEntity,
    drawTelegraphs: drawComposedTelegraphs,
    abilityStatus: composedAbilityStatus,
    pressQueue: true,
  }),
});

export function getEngineView(engine) {
  return ENGINE_VIEW[getMechanicsVersion(engine)?.id || LEGACY_MECHANICS_VERSION];
}
