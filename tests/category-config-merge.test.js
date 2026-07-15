const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const defaultConfig = ctx.normalizeCategoryConfig({});

test("custom contains rules merge on top of defaults instead of replacing them", () => {
  const merged = ctx.normalizeCategoryConfig({ contains: { dragonfruit: "Fresh Fruit and Vegetables" } });

  // The user's new rule is present...
  assert.equal(merged.contains.dragonfruit, "Fresh Fruit and Vegetables");
  // ...and every default contains rule is still there (so plugin-update rules reach customised files).
  for (const key of Object.keys(defaultConfig.contains)) {
    assert.ok(key in merged.contains, `expected default contains key "${key}" to survive the merge`);
  }
});

test("a default contains rule still classifies after the user adds an unrelated custom rule", () => {
  const raw = { contains: { dragonfruit: "Fresh Fruit and Vegetables" } };
  // saffron is a bundled default rule the user's file does not redefine
  assert.equal(ctx.classifyIngredientCategoryWithReason("saffron", raw).category, "Spices and Seasoning");
});

test("user contains rule wins on key conflict and takes matching precedence", () => {
  const someDefaultKey = Object.keys(defaultConfig.contains)[0];
  const overridden = ctx.normalizeCategoryConfig({ contains: { [someDefaultKey]: "Protein" } });
  assert.equal(overridden.contains[someDefaultKey], "Protein");

  // User-defined contains rules are iterated before default-only ones.
  const mergedKeys = Object.keys(overridden.contains);
  assert.equal(mergedKeys[0], someDefaultKey);
});

test("custom exact rules merge with default exact rules", () => {
  const merged = ctx.normalizeCategoryConfig({ exact: { quinoa: "Pantry Staples" } });
  assert.equal(merged.exact.quinoa, "Pantry Staples");
  for (const key of Object.keys(defaultConfig.exact)) {
    assert.ok(key in merged.exact, `expected default exact key "${key}" to survive the merge`);
  }
});
