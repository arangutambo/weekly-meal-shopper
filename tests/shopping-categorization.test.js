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
