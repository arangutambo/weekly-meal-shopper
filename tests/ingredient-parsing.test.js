const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("parses ingredient lines from fixture markdown", () => {
  const fixturePath = path.resolve(__dirname, "fixtures", "ingredients", "basic-aus.md");
  const content = fs.readFileSync(fixturePath, "utf8");

  const lines = Array.from(ctx.extractIngredientsSection(content));
  assert.deepEqual(lines, ["- 1 cup flour", "- 1 tbsp olive oil", "- 1 tsp salt"]);

  const parsed = lines.map((line) => ctx.parseIngredientLine(line));
  assert.equal(parsed[0].name, "flour");
  assert.equal(parsed[0].amountMetric, 250);
  assert.equal(parsed[0].unitMetric, "ml");

  assert.equal(parsed[1].name, "olive oil");
  assert.equal(parsed[1].amountMetric, 15);
  assert.equal(parsed[1].unitMetric, "ml");

  assert.equal(parsed[2].name, "salt");
  assert.equal(parsed[2].amountMetric, 5);
  assert.equal(parsed[2].unitMetric, "ml");
});

test("direction normalization bolds compound ingredient names once", () => {
  const ingredients = [
    "- 1/2 cup aquafaba",
    "- 1 tsp vanilla extract",
    "- 1 tsp baking soda",
    "- 1 cup oat milk",
  ];
  const directions = ["Whisk aquafaba and vanilla extract with oat milk, then add baking soda."];
  const [bolded] = ctx.normalizeDirectionsSectionLines(directions, ingredients);

  assert.match(bolded, /\*\*aquafaba\*\*/i);
  assert.match(bolded, /\*\*vanilla extract\*\*/i);
  assert.match(bolded, /\*\*oat milk\*\*/i);
  assert.match(bolded, /\*\*baking soda\*\*/i);
  assert.doesNotMatch(bolded, /\*\*baking\*\*\s+\*\*soda\*\*/i);
});

test("direction normalization links shared generic groups like sugars", () => {
  const ingredients = [
    "- 110 g soft brown sugar",
    "- 55 g white sugar",
    "- 125 g unsalted butter",
  ];
  const directions = ["Cream the butter and sugars until fluffy and smooth."];
  const [bolded] = ctx.normalizeDirectionsSectionLines(directions, ingredients);

  assert.match(bolded, /\*\*butter\*\*/i);
  assert.match(bolded, /\*\*sugars\*\*/i);
});

test("direction normalization does not match baking powder inside baking paper", () => {
  const ingredients = ["- 1 tsp baking powder"];
  const directions = ["Line baking trays with baking paper before mixing."];
  const [bolded] = ctx.normalizeDirectionsSectionLines(directions, ingredients);

  assert.doesNotMatch(bolded, /\*\*baking\*\*/i);
  assert.doesNotMatch(bolded, /\*\*baking paper\*\*/i);
});

test("direction normalization matches flour from plain flour ingredient", () => {
  const ingredients = ["- 150 g plain flour"];
  const directions = ["Sift the flour into the bowl."];
  const [bolded] = ctx.normalizeDirectionsSectionLines(directions, ingredients);

  assert.match(bolded, /\*\*flour\*\*/i);
});

test("transcribed ingredient normalization expands pecans to pecan nuts", () => {
  const plugin = new PluginClass();
  plugin.settings = { ingredientStorageSeparator: ";" };
  const [line] = plugin.normalizeTranscribedIngredientLines(["70 g chopped pecans"], { metricMode: false });
  assert.equal(line, "70; g; chopped pecan nuts;");
});

test("transcribed ingredient normalization keeps explicit countable units like can in metric mode", () => {
  const plugin = new PluginClass();
  plugin.settings = { ingredientStorageSeparator: ";" };
  const [line] = plugin.normalizeTranscribedIngredientLines(["1 can chickpeas"], { metricMode: true });
  assert.equal(line, "1; can; chickpeas;");
});

test("ingredient parser splits trailing preparation phrases even without commas", () => {
  const parsed = ctx.parseIngredientLine("- 250 g sweet potato roughly chopped");

  assert.ok(parsed);
  assert.equal(parsed.name, "sweet potato");
  assert.equal(parsed.preparation, "roughly chopped");
});

test("transcribed ingredient normalization adds commas before trailing preparation phrases", () => {
  const plugin = new PluginClass();
  plugin.settings = { ingredientStorageSeparator: ";" };
  const [line] = plugin.normalizeTranscribedIngredientLines(["1 can chickpeas drained and rinsed"], { metricMode: true });
  assert.equal(line, "1; can; chickpeas; drained and rinsed");
});

test("transcribed ingredient normalization converts dense metric volumes to grams", () => {
  const plugin = new PluginClass();
  plugin.settings = { ingredientStorageSeparator: ";" };
  const [line] = plugin.normalizeTranscribedIngredientLines(["1 cup olive oil"], { metricMode: true });
  assert.equal(line, "228; g; olive oil;");
});

test("transcribed ingredient normalization keeps metric volume when no density rule exists", () => {
  const plugin = new PluginClass();
  plugin.settings = { ingredientStorageSeparator: ";" };
  const [line] = plugin.normalizeTranscribedIngredientLines(["1 cup breadcrumbs"], { metricMode: true });
  assert.equal(line, "250; ml; breadcrumbs;");
});

test("structured ingredient parser accepts all supported separators and blank slots", () => {
  const semicolon = ctx.parseIngredientLine("- 1; ; Sweet Potato; Roughly Chopped", undefined, { allowLegacy: false });
  const comma = ctx.parseIngredientLine("- 2, cups, flour,", undefined, { allowLegacy: false });
  const colon = ctx.parseIngredientLine("- : : salt flakes and freshly ground black pepper :", undefined, { allowLegacy: false });
  const pipe = ctx.parseIngredientLine("- 1/2 | cup | kale | finely chopped", undefined, { allowLegacy: false });

  assert.equal(semicolon.amount, 1);
  assert.equal(semicolon.unitExplicit, false);
  assert.equal(semicolon.name, "Sweet Potato");
  assert.equal(semicolon.preparation, "Roughly Chopped");

  assert.equal(comma.amount, 2);
  assert.equal(comma.unit, "cups");
  assert.equal(comma.name, "flour");
  assert.equal(comma.preparation, "");

  assert.equal(colon.quantityUnknown, true);
  assert.equal(colon.unitExplicit, false);
  assert.equal(colon.name, "salt flakes and freshly ground black pepper");

  assert.equal(pipe.amount, 0.5);
  assert.equal(pipe.unit, "cup");
  assert.equal(pipe.name, "kale");
  assert.equal(pipe.preparation, "finely chopped");
});

test("structured-only parsing rejects legacy ingredient lines", () => {
  const parsed = ctx.parseIngredientLine("- 1 cup flour", undefined, { allowLegacy: false });
  assert.equal(parsed, null);
});

test("recipe view display formatter hides empty structured fields cleanly", () => {
  const parsed = ctx.parseIngredientLine("- 1; ; Sweet Potato; Roughly Chopped", undefined, { allowLegacy: false });
  const display = ctx.formatRecipeViewIngredientDisplay(parsed, {
    template: "{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}",
  });

  assert.equal(display, "1 Sweet Potato, Roughly Chopped");
});

test("transcribed direction normalization aligns generic nuts to ingredient names", () => {
  const plugin = new PluginClass();
  const ingredientLines = ["70 g chopped pecan nuts or walnuts"];
  const [line] = plugin.normalizeTranscribedDirectionLines(["Stir in chocolate and nuts."], ingredientLines);

  assert.match(line, /pecan nuts/i);
  assert.match(line, /walnuts/i);
  assert.doesNotMatch(line, /\*\*or walnuts\*\*/i);
});

test("ingredient formatter avoids duplicate count noun for items like egg", () => {
  const parsedEgg = ctx.parseIngredientLine("- 1 egg");
  const eggLine = ctx.formatIngredientLineFromParsed(parsedEgg, { metricMode: false });
  assert.equal(eggLine, "- 1 egg");

  const parsedEggs = ctx.parseIngredientLine("- 2 eggs");
  const eggsLine = ctx.formatIngredientLineFromParsed(parsedEggs, { metricMode: false });
  assert.equal(eggsLine, "- 2 eggs");
});

test("ingredient formatter keeps plain countable nouns like lettuce clean", () => {
  const parsed = ctx.parseIngredientLine("- 1 lettuce");
  const line = ctx.formatIngredientLineFromParsed(parsed, { metricMode: false });
  assert.equal(line, "- 1 lettuce");
});
