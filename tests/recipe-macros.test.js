const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

const item = (name, unitMetric, amountMetric, extra = {}) => ({
  name,
  canonicalName: name,
  unitMetric,
  amountMetric,
  quantityUnknown: false,
  ...extra,
});

test("estimateIngredientMacrosPer100g matches bundled entries and returns null for unknown ingredients", () => {
  const chicken = ctx.estimateIngredientMacrosPer100g("chicken breast");
  assert.ok(chicken);
  assert.equal(chicken.kcal, 165);
  assert.equal(chicken.protein, 31);

  assert.equal(ctx.estimateIngredientMacrosPer100g("some-nonexistent-ingredient-xyz"), null);
  assert.equal(ctx.estimateIngredientMacrosPer100g(""), null);
});

test("computeIngredientMacroContribution: 'g' unit scales directly off the per-100g table", () => {
  const findings = [];
  const contribution = ctx.computeIngredientMacroContribution(item("chicken breast", "g", 200), findings);
  assert.equal(findings.length, 0);
  assert.equal(contribution.kcal, 330);
  assert.equal(contribution.protein, 62);
  assert.equal(contribution.fat, 7.2);
});

test("computeIngredientMacroContribution: 'ml' unit converts to grams via density before scaling", () => {
  const findings = [];
  // olive oil: 0.91 g/ml density, 884 kcal / 100 fat per 100g
  const contribution = ctx.computeIngredientMacroContribution(item("olive oil", "ml", 100), findings);
  assert.equal(findings.length, 0);
  assert.ok(Math.abs(contribution.kcal - 804.44) < 0.01);
  assert.ok(Math.abs(contribution.fat - 91) < 0.01);
});

test("computeIngredientMacroContribution: 'unit' converts via the entry's gramsPerUnit", () => {
  const findings = [];
  // egg: gramsPerUnit 50, 143 kcal / 100g -> 2 eggs = 100g = 143 kcal
  const contribution = ctx.computeIngredientMacroContribution(item("egg", "unit", 2), findings);
  assert.equal(findings.length, 0);
  assert.equal(contribution.kcal, 143);
  assert.equal(contribution.protein, 12.6);
});

test("computeIngredientMacroContribution surfaces findings instead of guessing", () => {
  let findings = [];
  assert.equal(ctx.computeIngredientMacroContribution(item("unknown-thing", "g", 100), findings), null);
  assert.equal(findings[0].type, "no-nutrition-data");

  findings = [];
  // chicken breast has no density entry, so ml can't convert to grams
  assert.equal(ctx.computeIngredientMacroContribution(item("chicken breast", "ml", 100), findings), null);
  assert.equal(findings[0].type, "no-density-data");

  findings = [];
  // chicken breast has no gramsPerUnit, so count-based amounts can't convert
  assert.equal(ctx.computeIngredientMacroContribution(item("chicken breast", "unit", 2), findings), null);
  assert.equal(findings[0].type, "no-unit-weight-data");

  findings = [];
  assert.equal(
    ctx.computeIngredientMacroContribution(item("chicken breast", "g", 100, { quantityUnknown: true }), findings),
    null
  );
  assert.equal(findings[0].type, "unknown-quantity");
});

test("computeRecipeMacros sums contributions and divides by servings", () => {
  const ingredients = [
    item("chicken breast", "g", 200), // 330 kcal, 62 protein, 0 carbs, 7.2 fat
    item("egg", "unit", 2), // 143 kcal, 12.6 protein, 0.7*1=0.7 carbs, 9.5 fat
  ];
  const { perServing, totals, findings } = ctx.computeRecipeMacros(ingredients, 2);
  assert.equal(findings.length, 0);
  assert.ok(Math.abs(totals.kcal - 473) < 0.01);
  assert.ok(Math.abs(perServing.kcal - 236.5) < 0.01);
  assert.ok(Math.abs(perServing.protein - 37.3) < 0.01);
});

test("computeRecipeMacros floors the divisor at 1, matching getRecipePortions", () => {
  const ingredients = [item("chicken breast", "g", 100)];
  const zero = ctx.computeRecipeMacros(ingredients, 0);
  const one = ctx.computeRecipeMacros(ingredients, 1);
  assert.deepEqual(zero.perServing, one.perServing);
});

test("computeRecipeMacros collects findings from unresolved ingredients without aborting the whole recipe", () => {
  const ingredients = [item("chicken breast", "g", 100), item("mystery-ingredient", "g", 50)];
  const { perServing, findings } = ctx.computeRecipeMacros(ingredients, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "no-nutrition-data");
  assert.equal(perServing.kcal, 165); // only the resolvable ingredient contributes
});
