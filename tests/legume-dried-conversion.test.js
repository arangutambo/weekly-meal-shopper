const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const convert = (item, factors) => ctx.convertLegumeToDriedForShopping(item, factors);

test("canned/counted legumes convert to dried grams using the per-can factor", () => {
  // 2 cans chickpeas -> 2 * 85 g dried, ml = g / 0.8
  const out = convert({ name: "chickpeas", unit: "unit", amount: 2, recipes: new Set() });
  assert.equal(out.name, "dried chickpeas");
  assert.equal(out.unit, "g");
  assert.equal(out.amount, 170);
  assert.equal(out.secondaryUnit, "ml");
  assert.equal(out.secondaryAmount, 213);
});

test("a bare gram weight is treated as an already-dry from-scratch amount", () => {
  const out = convert({ name: "black beans", unit: "g", amount: 200, recipes: new Set() });
  assert.equal(out.name, "dried black beans");
  assert.equal(out.amount, 200);
  assert.equal(out.secondaryAmount, 250); // 200 / 0.8
});

test("explicitly canned weights use the cooked->dried factor", () => {
  const out = convert({ name: "canned chickpeas", unit: "g", amount: 400, recipes: new Set() });
  assert.equal(out.name, "dried chickpeas"); // "canned" stripped from the name
  assert.equal(out.amount, 160); // 400 * 0.4
});

test("already-dried legumes keep their weight and aren't double-prefixed", () => {
  const out = convert({ name: "dried lentils", unit: "g", amount: 150, recipes: new Set() });
  assert.equal(out.name, "dried lentils");
  assert.equal(out.amount, 150);
});

test("non-legumes and fresh beans are not converted", () => {
  assert.equal(convert({ name: "green beans", unit: "g", amount: 200 }), null);
  assert.equal(convert({ name: "carrot", unit: "unit", amount: 3 }), null);
  assert.equal(convert({ name: "chickpeas", unit: "g", amount: 0 }), null);
  assert.equal(convert({ name: "chickpeas", unit: "g", amount: 100, quantityUnknown: true }), null);
});

test("conversion honours custom factor overrides", () => {
  const out = convert({ name: "chickpeas", unit: "unit", amount: 2, recipes: new Set() }, { gramsDriedPerCan: 100, densityGPerMl: 1 });
  assert.equal(out.amount, 200); // 2 cans * 100 g
  assert.equal(out.secondaryAmount, 200); // 200 g / 1.0 g per ml
});

test("resolveLegumeFactors reads settings keys and falls back to defaults", () => {
  const partial = ctx.resolveLegumeFactors({ legumeGramsDriedPerCan: 90, legumeCookedToDriedFactor: 0.5 });
  assert.equal(partial.gramsDriedPerCan, 90);
  assert.equal(partial.cookedToDriedFactor, 0.5);
  assert.equal(partial.densityGPerMl, 0.8); // unset -> default

  const defaults = ctx.resolveLegumeFactors({});
  assert.equal(defaults.gramsDriedPerCan, 85);
  assert.equal(defaults.cookedToDriedFactor, 0.4);
  assert.equal(defaults.densityGPerMl, 0.8);

  // non-positive / invalid values fall back to defaults
  const invalid = ctx.resolveLegumeFactors({ legumeGramsDriedPerCan: -5, driedLegumeDensityGPerMl: 0 });
  assert.equal(invalid.gramsDriedPerCan, 85);
  assert.equal(invalid.densityGPerMl, 0.8);
});

test("grouped checklist only converts legumes when legumeMode is 'dried'", () => {
  const categoryConfig = ctx.normalizeCategoryConfig({});
  const totals = new Map();
  totals.set("k", {
    name: "chickpeas",
    unit: "unit",
    amount: 2,
    quantityUnknown: false,
    recipes: new Set(["Curry.md"]),
    category: "Pantry Staples",
    categoryReason: "test",
  });

  const canned = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig, legumeMode: "canned" });
  assert.ok(canned.some((l) => /\(2\) chickpeas/.test(l)), "canned mode leaves the can count");
  assert.ok(!canned.some((l) => /dried/.test(l)));

  const dried = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig, legumeMode: "dried" });
  assert.ok(dried.some((l) => /\(170 g \/ 213 ml\) dried chickpeas/.test(l)), "dried mode shows g + ml");
});
