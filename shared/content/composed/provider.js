// How a Composed move travels to and from the model that generates it: templates
// are sent as JSON strings so the provider's schema stays small.
import { composedMoveSchema, validateComposedMove } from './schema.js';
export const COMPOSED_PROVIDER_TRANSPORT = 'template-strings-v3';
export const composedProviderMoveSchema = {
  ...composedMoveSchema,
  properties: {
    ...composedMoveSchema.properties,
    templates: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      description: 'JSON-encoded template objects matching the complete Composed component schema.',
      items: {
        type: 'string',
        minLength: 2,
        maxLength: 16384,
        description:
          'One JSON template with bounded geometry, events, guidance, ray and actor components.',
      },
    },
  },
};
export function decodeComposedProviderMove(raw) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    !Array.isArray(raw.templates) ||
    raw.templates.length < 1 ||
    raw.templates.length > 8
  )
    throw Error('Move transport requires 1–8 JSON-encoded template strings');
  const templates = raw.templates.map((text, index) => {
    if (typeof text !== 'string' || text.length < 2 || text.length > 16384)
      throw Error(`Template ${index + 1}: expected a bounded JSON string`);
    try {
      return JSON.parse(text);
    } catch {
      throw Error(`Template ${index + 1}: malformed JSON object`);
    }
  });
  return validateComposedMove({ ...raw, templates });
}
export function encodeComposedProviderMove(raw) {
  const move = validateComposedMove(raw);
  return { ...move, templates: move.templates.map((template) => JSON.stringify(template)) };
}
