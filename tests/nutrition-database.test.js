const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

const NUTRITION_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-database.json";
const DOWNLOADED_NUTRITION_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-database-downloaded.json";
const LIVE_NUTRITION_CACHE_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-live-cache.json";

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

test("a valid custom nutritionDatabasePath takes priority over the bundled default when source is 'custom'", async () => {
  const customPath = "Utility/my-nutrition.json";
  const customContent = JSON.stringify({
    entries: { "special ingredient": { kcal: 999, protein: 1, carbs: 1, fat: 1 } },
  });
  const { plugin } = makePluginWithFiles({ [customPath]: customContent });
  plugin.settings.nutritionDatabaseSource = "custom";
  plugin.settings.nutritionDatabasePath = customPath;

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["special ingredient"].kcal, 999);
  // NUTRITION_ENTRIES (module global) now reflects the custom file only
  assert.equal(ctx.estimateIngredientMacrosPer100g("special ingredient").kcal, 999);
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast"), null);
});

test("setting a custom path without switching source to 'custom' has no effect (source stays builtin)", async () => {
  const customPath = "Utility/my-nutrition.json";
  const customContent = JSON.stringify({ entries: { "special ingredient": { kcal: 999, protein: 1, carbs: 1, fat: 1 } } });
  const { plugin } = makePluginWithFiles({ [customPath]: customContent });
  plugin.settings.nutritionDatabasePath = customPath; // source left at default "builtin"

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("loadNutritionConfig falls back to bundled defaults when the custom path is missing", async () => {
  const { plugin } = makePluginWithFiles();
  plugin.settings.nutritionDatabaseSource = "custom";
  plugin.settings.nutritionDatabasePath = "Utility/does-not-exist.json";

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("loadNutritionConfig falls back to bundled defaults when the custom path has invalid JSON", async () => {
  const customPath = "Utility/broken.json";
  const { plugin } = makePluginWithFiles({ [customPath]: "{ not valid json" });
  plugin.settings.nutritionDatabaseSource = "custom";
  plugin.settings.nutritionDatabasePath = customPath;

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("nutritionDatabaseSource 'downloaded' reads the downloaded file when present", async () => {
  const downloadedContent = JSON.stringify({
    entries: { "foraged mushroom": { kcal: 22, protein: 3, carbs: 3, fat: 0.3 } },
  });
  const { plugin } = makePluginWithFiles({ [DOWNLOADED_NUTRITION_CONFIG_PATH]: downloadedContent });
  plugin.settings.nutritionDatabaseSource = "downloaded";

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["foraged mushroom"].kcal, 22);
  assert.equal(ctx.estimateIngredientMacrosPer100g("foraged mushroom").kcal, 22);
});

test("nutritionDatabaseSource 'downloaded' falls back to bundled defaults when nothing has been downloaded yet", async () => {
  const { plugin } = makePluginWithFiles();
  plugin.settings.nutritionDatabaseSource = "downloaded";

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("the live-lookup cache always merges on top, filling gaps without overriding the primary source", async () => {
  const cacheContent = JSON.stringify({
    entries: {
      "yak butter": { kcal: 720, protein: 0.5, carbs: 0, fat: 81 },
      // deliberately conflicts with a bundled entry — primary source must win
      "chicken breast": { kcal: 1, protein: 1, carbs: 1, fat: 1 },
    },
  });
  const { plugin } = makePluginWithFiles({ [LIVE_NUTRITION_CACHE_PATH]: cacheContent });
  // source left at default "builtin"

  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("yak butter").kcal, 720);
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 165); // bundled wins over cache
});

const NUTRITION_OVERRIDES_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-overrides.json";

test("saveNutritionOverride writes an entry that loadNutritionConfig picks up", async () => {
  const { plugin } = makePluginWithFiles();
  await plugin.saveNutritionOverride("my special chicken", { kcal: 200, protein: 40, carbs: 0, fat: 5 });

  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("my special chicken").kcal, 200);
});

test("a manual override wins over the primary source on an exact key conflict", async () => {
  const { plugin } = makePluginWithFiles();
  await plugin.saveNutritionOverride("chicken breast", { kcal: 999, protein: 1, carbs: 1, fat: 1 });

  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 999);
});

test("a manual override wins over the live-lookup cache too", async () => {
  const cacheContent = JSON.stringify({ entries: { "yak butter": { kcal: 720, protein: 0.5, carbs: 0, fat: 81 } } });
  const { plugin } = makePluginWithFiles({ [LIVE_NUTRITION_CACHE_PATH]: cacheContent });
  await plugin.saveNutritionOverride("yak butter", { kcal: 1, protein: 1, carbs: 1, fat: 1 });

  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("yak butter").kcal, 1);
});

test("removeNutritionOverride deletes the override so the primary source resolves again", async () => {
  const { plugin } = makePluginWithFiles();
  await plugin.saveNutritionOverride("chicken breast", { kcal: 999, protein: 1, carbs: 1, fat: 1 });
  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 999);

  await plugin.removeNutritionOverride("chicken breast");
  await plugin.loadNutritionConfig();
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 165);
});

test("loadNutritionOverrideEntries auto-creates an empty overrides file", async () => {
  const { plugin, files } = makePluginWithFiles();
  assert.equal(files.has(NUTRITION_OVERRIDES_PATH), false);

  const entries = await plugin.loadNutritionOverrideEntries();
  assert.deepEqual(Object.keys(entries), []);
  assert.ok(files.has(NUTRITION_OVERRIDES_PATH));
});
