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
  plugin.settings = {};
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

test("loadNutritionConfig uses the bundled default when nothing has been downloaded yet", async () => {
  const { plugin } = makePluginWithFiles();
  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken breast").kcal, 165);
});

test("loadNutritionConfig reads the downloaded USDA file when present — there's no source to choose anymore, it's always used", async () => {
  const downloadedContent = JSON.stringify({
    entries: { "foraged mushroom": { kcal: 22, protein: 3, carbs: 3, fat: 0.3 } },
  });
  const { plugin } = makePluginWithFiles({ [DOWNLOADED_NUTRITION_CONFIG_PATH]: downloadedContent });

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["foraged mushroom"].kcal, 22);
  assert.equal(ctx.estimateIngredientMacrosPer100g("foraged mushroom").kcal, 22);
});

test("loadNutritionConfig falls back to bundled defaults when the downloaded file has invalid JSON", async () => {
  const { plugin } = makePluginWithFiles({ [DOWNLOADED_NUTRITION_CONFIG_PATH]: "{ not valid json" });

  const config = await plugin.loadNutritionConfig();
  assert.equal(config.entries["chicken breast"].kcal, 165);
});

test("estimateIngredientMacrosPer100g word-overlap fallback matches verbose USDA-style descriptions", async () => {
  // Real USDA bulk-dataset entries are long, official descriptions, longer
  // than the short text a user actually types — the plain substring check
  // ("does the ingredient text CONTAIN this pattern?") can never match them
  // in that direction. Every word the user typed must still appear
  // somewhere among the pattern's words, in any order.
  const downloadedContent = JSON.stringify({
    entries: {
      "chicken broiler or fryers breast skinless boneless meat only cooked braised": { kcal: 173, protein: 29, carbs: 0, fat: 6 },
    },
  });
  const { plugin } = makePluginWithFiles({ [DOWNLOADED_NUTRITION_CONFIG_PATH]: downloadedContent });

  await plugin.loadNutritionConfig();
  const macros = ctx.estimateIngredientMacrosPer100g("chicken breast");
  assert.ok(macros, "expected the word-overlap fallback to find a match");
  assert.equal(macros.kcal, 173);

  // Words that aren't all present should still fail to match.
  assert.equal(ctx.estimateIngredientMacrosPer100g("chicken thigh"), null);
});

test("the live-lookup cache always merges on top, filling gaps without overriding the downloaded/bundled data", async () => {
  const cacheContent = JSON.stringify({
    entries: {
      "yak butter": { kcal: 720, protein: 0.5, carbs: 0, fat: 81 },
      // deliberately conflicts with a bundled entry — primary source must win
      "chicken breast": { kcal: 1, protein: 1, carbs: 1, fat: 1 },
    },
  });
  const { plugin } = makePluginWithFiles({ [LIVE_NUTRITION_CACHE_PATH]: cacheContent });

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

test("a manual override wins over the downloaded/bundled data on an exact key conflict", async () => {
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

test("removeNutritionOverride deletes the override so the downloaded/bundled data resolves again", async () => {
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

test("ensureDownloadedNutritionDatasetIsActive does nothing when macro tracking is off", async () => {
  const { plugin, files } = makePluginWithFiles();
  plugin.settings.macrosEnabled = false;

  await plugin.ensureDownloadedNutritionDatasetIsActive();

  assert.equal(files.has(DOWNLOADED_NUTRITION_CONFIG_PATH), false);
});

test("ensureDownloadedNutritionDatasetIsActive does not re-download when the file already exists", async () => {
  const downloadedContent = JSON.stringify({ entries: { "foraged mushroom": { kcal: 22, protein: 3, carbs: 3, fat: 0.3 } } });
  const { plugin, files } = makePluginWithFiles({ [DOWNLOADED_NUTRITION_CONFIG_PATH]: downloadedContent });
  plugin.settings.macrosEnabled = true;

  // requestUrl throws in the test stub, so if this reached downloadNutritionDataset
  // (network path) the test would fail — proves the already-downloaded check short-circuits it.
  await plugin.ensureDownloadedNutritionDatasetIsActive();

  assert.equal(files.get(DOWNLOADED_NUTRITION_CONFIG_PATH), downloadedContent);
});

test("ensureDownloadedNutritionDatasetIsActive is a no-op on mobile", async () => {
  const { plugin, files } = makePluginWithFiles();
  plugin.settings.macrosEnabled = true;

  ctx.__obsidian.Platform.isMobileApp = true;
  try {
    await plugin.ensureDownloadedNutritionDatasetIsActive();
  } finally {
    ctx.__obsidian.Platform.isMobileApp = false;
  }

  assert.equal(files.has(DOWNLOADED_NUTRITION_CONFIG_PATH), false);
});
