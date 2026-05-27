const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

test("categorization fixture stays stable", () => {
  const fixturePath = path.resolve(__dirname, "fixtures", "categorization", "expected-basic.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const items = Array.isArray(fixture?.items) ? fixture.items : [];

  assert.ok(items.length > 0);
  for (const item of items) {
    const classified = ctx.classifyIngredientCategoryWithReason(item.name);
    assert.equal(classified.category, item.category);
    assert.ok(classified.reason);
  }
});

test("regressions: pantry/protein/spices staples are classified correctly", () => {
  const checks = [
    ["chorizo", "Protein"],
    ["spaghetti", "Pantry Staples"],
    ["tamari", "Pantry Staples"],
    ["bay leaves", "Spices and Seasoning"],
  ];

  for (const [name, expected] of checks) {
    const classified = ctx.classifyIngredientCategoryWithReason(name);
    assert.equal(classified.category, expected);
  }
});

test("previously-missing spices land in Spices and Seasoning via DEFAULT config", () => {
  const spices = ["saffron", "cardamom", "star anise", "nutmeg", "sumac", "harissa", "dukkah", "szechuan pepper", "fennel seeds", "five spice"];
  for (const name of spices) {
    const classified = ctx.classifyIngredientCategoryWithReason(name);
    assert.equal(classified.category, "Spices and Seasoning", `expected ${name} → Spices and Seasoning, got ${classified.category}`);
  }
});

test("chili is Fresh Fruit and Vegetables; chili flake is Spices and Seasoning", () => {
  const fresh = ctx.classifyIngredientCategoryWithReason("red chili");
  assert.equal(fresh.category, "Fresh Fruit and Vegetables");

  const dried = ctx.classifyIngredientCategoryWithReason("chili flakes");
  assert.equal(dried.category, "Spices and Seasoning");
});

test("pizza does not match za atar spice rule", () => {
  const classified = ctx.classifyIngredientCategoryWithReason("pizza base");
  assert.notEqual(classified.category, "Spices and Seasoning");
});

test("shopping display name normalizes scallion, green onion, and bell pepper synonyms", () => {
  assert.equal(ctx.normalizeShoppingDisplayName("scallions"), "spring onion");
  assert.equal(ctx.normalizeShoppingDisplayName("green onions"), "spring onion");
  assert.equal(ctx.normalizeShoppingDisplayName("bell pepper"), "capsicum");
  assert.equal(ctx.normalizeShoppingDisplayName("red bell peppers"), "red capsicum");
});

test("moveArrayItem reorders category rows for drag-and-drop saving", () => {
  assert.deepEqual(
    Array.from(ctx.moveArrayItem(["A", "B", "C", "D"], 1, 3)),
    ["A", "C", "D", "B"]
  );
  assert.deepEqual(
    Array.from(ctx.moveArrayItem(["A", "B", "C", "D"], 3, 1)),
    ["A", "D", "B", "C"]
  );
});
