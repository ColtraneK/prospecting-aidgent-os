// Turn a semantic merge plan into writes for the columns that actually exist
// in this person's Sheet.  Positions are resolved from the live header row.

import { LEADS_HEADERS, HUMAN_FIELDS, COLS, colLetter } from "./schema.mjs";

const TAB = "Leads";

export function groupContiguous(indexes) {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let prev = null;
  for (const i of sorted) {
    if (start === null) { start = i; prev = i; }
    else if (i === prev + 1) prev = i;
    else { runs.push([start, prev]); start = i; prev = i; }
  }
  if (start !== null) runs.push([start, prev]);
  return runs;
}

function fieldIndex(field, layout) {
  if (layout?.byCanonical?.[field]) return layout.byCanonical[field].index0;
  return COLS[field]?.index0;
}

function assertNoHumanFields(fields) {
  for (const field of fields) {
    if (HUMAN_FIELDS.includes(field)) throw new Error(`refusing to write human column / field ${field}`);
  }
}

const NEW_ROW_HUMAN_FIELDS = new Set(["Date Added", "Source Type"]);

/**
 * New leads are written as sparse cell updates at a chosen logical row instead
 * of using values.append.  Sheets often pre-fill checkbox columns far below
 * the visible table; values.append treats those unchecked values as a table
 * and can place a lead hundreds of rows away.  Sparse updates leave those
 * placeholders and every unmapped column untouched.
 */
export function buildAppendCellUpdates(newRows, layout, startRow) {
  const firstRow = Number(startRow);
  if (!Number.isInteger(firstRow) || firstRow < 1) throw new Error("append row must be a positive integer");
  const cellUpdates = [];
  for (let offset = 0; offset < (newRows || []).length; offset++) {
    const row = newRows[offset] || {};
    const cells = row.cells || {};
    for (const [field, value] of Object.entries(cells)) {
      if (value === undefined || value === "") continue;
      if (HUMAN_FIELDS.includes(field) && !NEW_ROW_HUMAN_FIELDS.has(field)) {
        throw new Error(`refusing to write human column / field ${field} on a new row`);
      }
      const index0 = fieldIndex(field, layout);
      if (index0 === undefined) continue;
      cellUpdates.push({
        range: `${TAB}!${colLetter(index0)}${firstRow + offset}`,
        values: [[value]],
      });
    }
  }
  return cellUpdates;
}

/** Full row in the live header order. Extra attendee columns remain blank. */
export function rowArray(cells, layout = null) {
  const headers = layout?.headers || LEADS_HEADERS;
  return headers.map((header, index0) => {
    const field = layout?.canonicalByIndex?.[index0] || header;
    return cells[field] === undefined ? "" : cells[field];
  });
}

/**
 * Build writes only for recognized agent/system fields.  A moved, renamed, or
 * extra column cannot shift a value into a human-owned cell.
 */
export function buildValueUpdates(plan, layout = null) {
  const appends = (plan.newRows || []).map((r) => rowArray(r.cells, layout));
  const cellUpdates = [];
  for (const u of plan.updates || []) {
    const entries = Object.entries(u.set).filter(([field, value]) => value !== undefined && fieldIndex(field, layout) !== undefined);
    assertNoHumanFields(entries.map(([field]) => field));
    const byIndex = new Map(entries.map(([field, value]) => [fieldIndex(field, layout), value]));
    for (const [start, end] of groupContiguous([...byIndex.keys()])) {
      const values = [];
      for (let i = start; i <= end; i++) values.push(byIndex.get(i));
      const range = start === end
        ? `${TAB}!${colLetter(start)}${u.rowNumber}`
        : `${TAB}!${colLetter(start)}${u.rowNumber}:${colLetter(end)}${u.rowNumber}`;
      cellUpdates.push({ range, values: [values] });
    }
  }
  return { appends, cellUpdates };
}

export { TAB as LEADS_TAB };
