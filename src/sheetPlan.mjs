// sheetPlan.mjs — turn a merge plan into concrete Google Sheets value writes.
// Pure and testable. Guarantees updates NEVER touch human columns H:N, because
// it only emits ranges for the exact columns present in each update's `set`.

import { LEADS_HEADERS, COLS, RANGE_HUMAN, colLetter } from "./schema.mjs";

const TAB = "Leads";

/** Group sorted 0-based column indexes into contiguous [start,end] runs. */
export function groupContiguous(indexes) {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const runs = [];
  let start = null;
  let prev = null;
  for (const i of sorted) {
    if (start === null) {
      start = i;
      prev = i;
    } else if (i === prev + 1) {
      prev = i;
    } else {
      runs.push([start, prev]);
      start = i;
      prev = i;
    }
  }
  if (start !== null) runs.push([start, prev]);
  return runs;
}

function assertNoHumanColumns(indexes) {
  for (const i of indexes) {
    if (i >= RANGE_HUMAN[0] && i <= RANGE_HUMAN[1]) {
      throw new Error(`refusing to write human column ${colLetter(i)} (${LEADS_HEADERS[i]})`);
    }
  }
}

/** Full ordered row array (A:U) for a new lead's cells map. */
export function rowArray(cells) {
  return LEADS_HEADERS.map((h) => (cells[h] === undefined ? "" : cells[h]));
}

/**
 * @param plan { newRows:[{cells}], updates:[{rowNumber,set}] }
 * @returns { appends: [rowArray...], cellUpdates: [{range, values}] }
 */
export function buildValueUpdates(plan) {
  const appends = (plan.newRows || []).map((r) => rowArray(r.cells));

  const cellUpdates = [];
  for (const u of plan.updates || []) {
    const row = u.rowNumber;
    const entries = Object.entries(u.set).filter(([, v]) => v !== undefined);
    const indexes = entries.map(([h]) => COLS[h].index0);
    assertNoHumanColumns(indexes);
    const byIndex = new Map(entries.map(([h, v]) => [COLS[h].index0, v]));
    for (const [start, end] of groupContiguous(indexes)) {
      const values = [];
      for (let i = start; i <= end; i++) values.push(byIndex.has(i) ? byIndex.get(i) : "");
      const range =
        start === end
          ? `${TAB}!${colLetter(start)}${row}`
          : `${TAB}!${colLetter(start)}${row}:${colLetter(end)}${row}`;
      cellUpdates.push({ range, values: [values] });
    }
  }
  return { appends, cellUpdates };
}

export { TAB as LEADS_TAB };
