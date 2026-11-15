// The state hash: eight hex digits that two machines compare to learn whether they
// hold the same match.
//
// What is hashed is written down. Each engine lists the fields of its state, in
// order, and the fields it leaves out with the reason (classic/state-fields.js,
// composed/state-fields.js). A field in neither list is not hashed, and
// `unlistedFields` reports it so a test can fail.
//
// The hash is 32-bit FNV-1a over a byte stream. The stream starts with
// STATE_HASH_VERSION as four bytes, then the state. Every value starts with one
// tag byte:
//
//   0  absent        1  null         2  false        3  true
//   4  number: the eight bytes of the double, lowest byte first. -0 is written
//      as 0, and every NaN as 00 00 00 00 00 00 f8 7f.
//   5  text: the length as four bytes, then each UTF-16 code unit as two bytes.
//   6  list: the length as four bytes, then each item.
//   7  record: the listed fields in the listed order, with no names.
//   8  table: the number of keys as four bytes, then each key as text followed by
//      its value, keys sorted by UTF-16 code units.
//
// Multi-byte lengths and code units are lowest byte first. A move definition is
// written as the text of its name: definitions are inputs to the match, pinned
// when the round starts.
//
// Changing the encoding, or any field list, changes hashes. Raise
// STATE_HASH_VERSION for the first. Either one changes every pinned hash, so
// docs/MOVE_EDITIONS.md ("The state hash") says how to re-pin them.

export const STATE_HASH_VERSION = 1;

const FNV_OFFSET = 0x811c9dc5,
  FNV_PRIME = 0x01000193;
const scratch = new DataView(new ArrayBuffer(8));

/**
 * @typedef {{kind: 'record', fields: [string, FieldList | null][], known: Set<string>,
 *   omitted: Record<string, string>}
 *   | {kind: 'list', item: FieldList | null}
 *   | {kind: 'table', item: FieldList | null}
 *   | {kind: 'name'}} FieldList
 */

/**
 * The hashed fields of one kind of object, in hash order.
 *
 * A field given as a name holds a plain value: a number, text, a boolean, null,
 * or a list of those. A field given as `[name, fieldList]` holds a nested record,
 * list or table. `omitted` maps each field that is left out to the reason.
 *
 * @param {(string | [string, FieldList])[]} fields
 * @param {Record<string, string>} [omitted]
 * @returns {FieldList}
 */
export function record(fields, omitted = {}) {
  /** @type {[string, FieldList | null][]} */
  const entries = fields.map((field) => (typeof field === 'string' ? [field, null] : field));
  const known = new Set();
  for (const name of [...entries.map(([name]) => name), ...Object.keys(omitted)]) {
    if (known.has(name)) throw Error(`State field listed twice: ${name}`);
    known.add(name);
  }
  return { kind: 'record', fields: entries, known, omitted };
}
/** A list whose items are records, lists or tables. A list of plain values needs no field list. */
export const listOf = (/** @type {FieldList} */ item) =>
  /** @type {FieldList} */ ({ kind: 'list', item });
/** An object used as a lookup by key, such as scores by team. Omit `item` for plain values. */
export const tableOf = (/** @type {FieldList | null} */ item = null) =>
  /** @type {FieldList} */ ({ kind: 'table', item });
/** A move definition, hashed as its name. */
export const MOVE_NAME = /** @type {FieldList} */ ({ kind: 'name' });

/**
 * The hash of `state` over the fields in `fields`.
 * @param {FieldList} fields
 * @param {object} state
 * @returns {string} eight hex digits
 */
export function hashState(fields, state) {
  let h = FNV_OFFSET;
  const byte = (value) => {
    h = Math.imul(h ^ value, FNV_PRIME);
  };
  const count = (value) => {
    byte(value & 255);
    byte((value >>> 8) & 255);
    byte((value >>> 16) & 255);
    byte(value >>> 24);
  };
  const text = (value) => {
    byte(5);
    count(value.length);
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      byte(unit & 255);
      byte(unit >>> 8);
    }
  };
  const plain = (value) => {
    if (value === undefined) byte(0);
    else if (value === null) byte(1);
    else if (value === false) byte(2);
    else if (value === true) byte(3);
    else if (typeof value === 'number') {
      byte(4);
      if (Number.isNaN(value)) {
        scratch.setUint32(0, 0, true);
        scratch.setUint32(4, 0x7ff80000, true);
      }
      // Adding 0 turns -0 into 0 and leaves every other number alone.
      else scratch.setFloat64(0, value + 0, true);
      for (let i = 0; i < 8; i++) byte(scratch.getUint8(i));
    } else if (typeof value === 'string') text(value);
    else if (Array.isArray(value)) {
      byte(6);
      count(value.length);
      for (const item of value) plain(item);
    } else throw Error('State hash: an object needs a field list.');
  };
  const write = (/** @type {FieldList | null} */ list, value) => {
    if (!list || value === undefined || value === null) return plain(value);
    if (typeof value !== 'object') throw Error('State hash: expected an object.');
    if (list.kind === 'name') text(value.name);
    else if (list.kind === 'list') {
      byte(6);
      count(value.length);
      for (const item of value) write(list.item, item);
    } else if (list.kind === 'table') {
      const keys = Object.keys(value).sort();
      byte(8);
      count(keys.length);
      for (const key of keys) {
        text(key);
        write(list.item, value[key]);
      }
    } else {
      byte(7);
      for (const [name, field] of list.fields) write(field, value[name]);
    }
  };
  count(STATE_HASH_VERSION);
  write(fields, state);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The fields present in `state` that the field list neither hashes nor names as
 * omitted, as sorted paths such as `state.players[].stamina`. Empty when the
 * list accounts for everything.
 * @param {FieldList} fields
 * @param {object} state
 * @returns {string[]}
 */
export function unlistedFields(fields, state) {
  const found = new Set();
  const visit = (/** @type {FieldList | null} */ list, value, path) => {
    if (!list || value === undefined || value === null || list.kind === 'name') return;
    if (list.kind === 'list') for (const item of value) visit(list.item, item, `${path}[]`);
    else if (list.kind === 'table')
      for (const item of Object.values(value)) visit(list.item, item, `${path}.*`);
    else {
      for (const key of Object.keys(value)) if (!list.known.has(key)) found.add(`${path}.${key}`);
      for (const [name, field] of list.fields) visit(field, value[name], `${path}.${name}`);
    }
  };
  visit(fields, state, 'state');
  return [...found].sort();
}
