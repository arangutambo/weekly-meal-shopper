const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const categoryConfig = ctx.normalizeCategoryConfig({});

function makeTotals(items) {
  const totals = new Map();
  for (const item of items) {
    totals.set(item.name, {
      name: item.name,
      unit: item.unit,
      amount: item.amount,
      quantityUnknown: !!item.quantityUnknown,
      recipes: new Set(item.recipes || []),
      category: item.category,
      categoryReason: "test",
    });
  }
  return totals;
}

test("groups items under category headers and formats amounts", () => {
  const totals = makeTotals([
    { name: "carrot", unit: "unit", amount: 3, category: "Fresh Fruit and Vegetables", recipes: ["A.md"] },
    { name: "plain flour", unit: "g", amount: 200, category: "Pantry Staples", recipes: ["A.md"] },
  ]);
  const lines = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig });

  assert.ok(lines.includes("- Fresh Fruit and Vegetables"));
  assert.ok(lines.includes("- Pantry Staples"));
  assert.ok(lines.some((l) => /\(3\) carrots/.test(l)));
  assert.ok(lines.some((l) => /\(200 g\) plain flour/.test(l)));
});

test("spice amounts: pinch hidden, meaningful weight shown (integration with issue #2)", () => {
  const totals = makeTotals([
    { name: "cumin", unit: "tsp", amount: 1, category: "Spices and Seasoning", recipes: ["A.md"] },
    { name: "saffron", unit: "g", amount: 100, category: "Spices and Seasoning", recipes: ["A.md"] },
  ]);
  const lines = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig });

  const cuminLine = lines.find((l) => /cumin/.test(l));
  const saffronLine = lines.find((l) => /saffron/.test(l));
  assert.ok(cuminLine && !/\d/.test(cuminLine.replace(/\[ \]/, "")), "small spice amount should be hidden");
  assert.match(saffronLine, /\(100 g\) saffron/);
});

test("recipe usage links can be toggled on", () => {
  const totals = makeTotals([
    { name: "carrot", unit: "unit", amount: 2, category: "Fresh Fruit and Vegetables", recipes: ["Soup.md"] },
  ]);
  const withUsage = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig, includeRecipeUsage: true });
  const withoutUsage = ctx.buildGroupedShoppingChecklistLines(totals, { categoryConfig, includeRecipeUsage: false });

  assert.ok(withUsage.some((l) => l.includes("[[Soup.md|Soup]]")));
  assert.ok(!withoutUsage.some((l) => l.includes("Soup")));
});

test("empty totals produce no lines", () => {
  assert.equal(ctx.buildGroupedShoppingChecklistLines(new Map(), { categoryConfig }).length, 0);
});
