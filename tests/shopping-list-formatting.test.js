const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

test("override href helpers round-trip ingredient names", () => {
  const href = ctx.buildIngredientOverrideHref("sweet potato");

  assert.equal(
    href,
    "weekly-meal-shopper://ingredient-override?ingredient=sweet%20potato"
  );
  assert.equal(ctx.parseIngredientOverrideHref(href), "sweet potato");
});

test("recipe usage helper renders one indented line of sorted recipe links", () => {
  const line = ctx.buildShoppingRecipeUsageLine(new Set([
    "pages/Food and Drink/Recipes/Zucchini Pasta.md",
    "pages/Food and Drink/Recipes/Bean Stew.md",
    "pages/Food and Drink/Recipes/Bean Stew.md",
  ]));

  assert.equal(
    line,
    "    - [[pages/Food and Drink/Recipes/Bean Stew.md|Bean Stew]], [[pages/Food and Drink/Recipes/Zucchini Pasta.md|Zucchini Pasta]]"
  );
});

test("shopping list item formatter appends recipe usage and ingredient-specific override links", () => {
  const lines = Array.from(ctx.formatShoppingListItemLines({
    name: "chickpeas",
    unit: "g",
    amount: 400,
    quantityUnknown: false,
    recipes: new Set([
      "pages/Food and Drink/Recipes/Crispy Chickpeas.md",
      "pages/Food and Drink/Recipes/Traybake.md",
    ]),
  }, {
    includeRecipeUsage: true,
    includeOverrideLinks: true,
  }));

  assert.deepEqual(lines, [
    "  - [ ] (400 g) chickpeas [Override](weekly-meal-shopper://ingredient-override?ingredient=chickpeas)",
    "    - [[pages/Food and Drink/Recipes/Crispy Chickpeas.md|Crispy Chickpeas]], [[pages/Food and Drink/Recipes/Traybake.md|Traybake]]",
  ]);
});

test("shopping list item formatter omits recipe usage when the toggle is off", () => {
  const lines = Array.from(ctx.formatShoppingListItemLines({
    name: "black beans",
    unit: "",
    amount: 0,
    quantityUnknown: true,
    recipes: new Set(["pages/Food and Drink/Recipes/Burrito Bowl.md"]),
  }, {
    includeRecipeUsage: false,
    includeOverrideLinks: false,
  }));

  assert.deepEqual(lines, ["  - [ ] black beans"]);
});
