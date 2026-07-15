const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

test("summary lists built-in aliases for each volume unit", () => {
  const summary = ctx.buildUnitAliasSummary({ cup: [], tbsp: [], tsp: [] });
  const byUnit = Object.fromEntries(summary.map((s) => [s.unit, s]));

  assert.deepEqual(Array.from(byUnit.cup.builtIn), ["cup", "cups"]);
  assert.deepEqual(Array.from(byUnit.tbsp.builtIn), ["tbsp", "tbs", "tablespoon", "tablespoons"]);
  assert.deepEqual(Array.from(byUnit.tsp.builtIn), ["tsp", "teaspoon", "teaspoons"]);
  for (const s of summary) assert.equal(s.custom.length, 0);
});

test("custom aliases from the JSON file are surfaced as custom, not built-in", () => {
  const summary = ctx.buildUnitAliasSummary({ cup: ["c", "mug"], tbsp: [], tsp: ["t"] });
  const byUnit = Object.fromEntries(summary.map((s) => [s.unit, s]));

  assert.deepEqual(Array.from(byUnit.cup.custom), ["c", "mug"]);
  assert.deepEqual(Array.from(byUnit.tsp.custom), ["t"]);
});

test("custom aliases that merely repeat a built-in are filtered out", () => {
  const summary = ctx.buildUnitAliasSummary({ cup: ["cups", "c"], tbsp: ["tablespoons"], tsp: [] });
  const byUnit = Object.fromEntries(summary.map((s) => [s.unit, s]));

  // "cups" duplicates a built-in and drops out; "c" is genuinely custom
  assert.deepEqual(Array.from(byUnit.cup.custom), ["c"]);
  assert.deepEqual(Array.from(byUnit.tbsp.custom), []);
});
