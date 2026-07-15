const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const cat = (name) => ctx.classifyIngredientCategoryWithReason(name).category;

test("dried herbs land in the spices section even without a per-herb rule", () => {
  for (const name of ["dried oregano", "dried parsley", "dried basil", "dried thyme", "dried coriander", "dried mint"]) {
    assert.equal(cat(name), "Spices and Seasoning", `${name} should be a spice`);
  }
});

test("fresh herbs land in the fresh produce section even without a per-herb rule", () => {
  for (const name of ["fresh oregano", "fresh parsley", "fresh basil", "fresh thyme", "fresh rosemary", "fresh sage"]) {
    assert.equal(cat(name), "Fresh Fruit and Vegetables", `${name} should be fresh`);
  }
});

test("the fresh/dried qualifier survives extra wording", () => {
  assert.equal(cat("fresh oregano leaves"), "Fresh Fruit and Vegetables");
  assert.equal(cat("a handful of fresh oregano"), "Fresh Fruit and Vegetables");
  assert.equal(cat("dried oregano, crushed"), "Spices and Seasoning");
});

test("bare herb names keep their existing default classification", () => {
  // oregano/thyme without a qualifier conventionally mean the dried pantry form
  assert.equal(cat("oregano"), "Spices and Seasoning");
  assert.equal(cat("thyme"), "Spices and Seasoning");
  // basil/parsley/mint conventionally mean fresh
  assert.equal(cat("basil"), "Fresh Fruit and Vegetables");
  assert.equal(cat("parsley"), "Fresh Fruit and Vegetables");
});

test("non-herb dried/fresh items are unaffected by the herb rule", () => {
  // "dried" alone should not force a non-herb into spices
  assert.notEqual(cat("dried cranberries"), "Spices and Seasoning");
});

test("the herb rule falls back to normal rules if the target category was renamed", () => {
  // A config whose categoryOrder lacks the standard names: rule can't resolve a
  // category, so classification falls through to the contains rules.
  const renamed = {
    categoryOrder: ["Cupboard", "Garden"],
    contains: { oregano: "Cupboard" },
  };
  assert.equal(ctx.classifyIngredientCategoryWithReason("fresh oregano", renamed).category, "Cupboard");
});
