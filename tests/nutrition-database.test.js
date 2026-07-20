const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

const NUTRITION_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-database.json";

function makePluginWithFiles(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const plugin = new PluginClass();
  plugin.settings = { nutritionDatabasePath: "" };
  plugin.app = {
    vault: {
      adapter: {
        exists: async (p) => files.has(p),
        read: async (p) => {
          if (!files.has(p)) throw new Error(`missing file: ${p}`);
          return files.get(p);
        },
        write: async (p, content) => {
          files.set(p, content);
        },
      },
    },
  };
  return { plugin, files };
}

test("ensureNutritionConfigFile writes the bundled defaults when the file is missing", async () => {
  const { plugin, files } = makePluginWithFiles();
  assert.equal(files.has(NUTRITION_CONFIG_PATH), false);

  await plugin.ensureNutritionConfigFile();

  assert.ok(files.has(NUTRITION_CONFIG_PATH));
  const parsed = JSON.parse(files.get(NUTRITION_CONFIG_PATH));
  assert.equal(parsed.entries["chicken breast"].kcal, 165);
});

test("ensureNutritionConfigFile leaves an existing file untouched", async () => {
  const custom = JSON.stringify({ entries: { "test food": { kcal: 1, protein: 1, carbs: 1, fat: 1 } } });
  const { plugin, files } = makePluginWithFiles({ [NUTRITION_CONFIG_PATH]: custom });

  await plugin.ensureNutritionConfigFile();

  assert.equal(files.get(NUTRITION_CONFIG_PATH), custom);
});

test("loadNutritionConfig uses the bundled default when no custom path is set", async () => {
  const { plugin } = makePluginWithFiles();
  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 165);
});

test("a valid custom nutritionDatabasePath takes priority over the bundled default", async () => {
  const customPath = "Utility/my-nutrition.json";
  const customContent = JSON.stringify({
    entries: { "special ingredient": { kcal: 999, protein: 1, carbs: 1, fat: 1 } },
  });
  const { plugin } = makePluginWithFiles({ [customPath]: customContent });
  plugin.settings.nutritionDatabasePath = customPath;

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["special ingredient"].kcal, 999);
  // NUTRITION_ENTRIES (module global) now reflects the custom file only
  assert.equal(ctx.estimateIngredientMacrosPer100g("special ingredient").kcal, 999);
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast"), null);
});

test("loadNutritionConfig falls back to bundled defaults when the custom path is missing", async () => {
  const { plugin } = makePluginWithFiles();
  plugin.settings.nutritionDatabasePath = "Utility/does-not-exist.json";

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("loadNutritionConfig falls back to bundled defaults when the custom path has invalid JSON", async () => {
  const customPath = "Utility/broken.json";
  const { plugin } = makePluginWithFiles({ [customPath]: "{ not valid json" });
  plugin.settings.nutritionDatabasePath = customPath;

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});
