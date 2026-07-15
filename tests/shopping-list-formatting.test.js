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

test("recipe usage suffix renders sorted recipe links inline, joined by ' - '", () => {
  const suffix = ctx.buildShoppingRecipeUsageSuffix(new Set([
    "pages/Food and Drink/Recipes/Zucchini Pasta.md",
    "pages/Food and Drink/Recipes/Bean Stew.md",
    "pages/Food and Drink/Recipes/Bean Stew.md",
  ]));

  assert.equal(
    suffix,
    " - [[pages/Food and Drink/Recipes/Bean Stew.md|Bean Stew]] - [[pages/Food and Drink/Recipes/Zucchini Pasta.md|Zucchini Pasta]]"
  );
});

test("shopping list item formatter appends recipe usage inline plus override links", () => {
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
    "  - [ ] (400 g) chickpeas [Override](weekly-meal-shopper://ingredient-override?ingredient=chickpeas) - [[pages/Food and Drink/Recipes/Crispy Chickpeas.md|Crispy Chickpeas]] - [[pages/Food and Drink/Recipes/Traybake.md|Traybake]]",
  ]);
});

test("dried-legume items render both grams and ml in the amount label", () => {
  const lines = Array.from(ctx.formatShoppingListItemLines({
    name: "dried chickpeas",
    unit: "g",
    amount: 170,
    secondaryAmount: 213,
    secondaryUnit: "ml",
    quantityUnknown: false,
    recipes: new Set(),
  }, { includeRecipeUsage: false }));

  assert.deepEqual(lines, ["  - [ ] (170 g / 213 ml) dried chickpeas"]);
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
