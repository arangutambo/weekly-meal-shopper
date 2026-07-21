const assert = require("node:assert/strict");
const test = require("node:test");
const zlib = require("node:zlib");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

// --- USDA live search API extraction (verified real field shape: flat
// nutrientId/value, ids 1003 protein / 1004 fat / 1005 carbs / 1008 kcal) ---

test("extractUsdaSearchResultMacros reads the real USDA search API shape", () => {
  const foodNutrients = [
    { nutrientId: 1003, nutrientName: "Protein", value: 20.4, unitName: "G" },
    { nutrientId: 1004, nutrientName: "Total lipid (fat)", value: 8.1, unitName: "G" },
    { nutrientId: 1005, nutrientName: "Carbohydrate, by difference", value: 1.06, unitName: "G" },
    { nutrientId: 1008, nutrientName: "Energy", value: 165, unitName: "KCAL" },
  ];
  const macros = ctx.extractUsdaSearchResultMacros(foodNutrients);
  assert.equal(macros.kcal, 165);
  assert.equal(macros.protein, 20.4);
  assert.equal(macros.fat, 8.1);
  assert.equal(macros.carbs, 1.06);
});

test("extractUsdaSearchResultMacros returns null when energy is missing or input is malformed", () => {
  assert.equal(ctx.extractUsdaSearchResultMacros([{ nutrientId: 1003, value: 20 }]), null); // no kcal entry
  assert.equal(ctx.extractUsdaSearchResultMacros([]), null);
  assert.equal(ctx.extractUsdaSearchResultMacros(null), null);
  assert.equal(ctx.extractUsdaSearchResultMacros(undefined), null);
});

test("extractUsdaSearchResultMacros defaults missing macro fields to 0 rather than dropping the result", () => {
  const macros = ctx.extractUsdaSearchResultMacros([{ nutrientId: 1008, value: 50 }]);
  assert.equal(macros.kcal, 50);
  assert.equal(macros.protein, 0);
  assert.equal(macros.carbs, 0);
  assert.equal(macros.fat, 0);
});

// --- Open Food Facts extraction (verified real field shape: "..._100g" keys) ---

test("extractOpenFoodFactsMacros reads the real Open Food Facts nutriments shape", () => {
  const nutriments = {
    "energy-kcal_100g": 159,
    "energy-kj_100g": 643,
    "proteins_100g": 5,
    "carbohydrates_100g": 10,
    "fat_100g": 11,
    "sugars_100g": 4,
  };
  const macros = ctx.extractOpenFoodFactsMacros(nutriments);
  assert.equal(macros.kcal, 159);
  assert.equal(macros.protein, 5);
  assert.equal(macros.carbs, 10);
  assert.equal(macros.fat, 11);
});

test("extractOpenFoodFactsMacros returns null when nutriments or energy is missing", () => {
  assert.equal(ctx.extractOpenFoodFactsMacros(null), null);
  assert.equal(ctx.extractOpenFoodFactsMacros({ proteins_100g: 5 }), null); // no energy-kcal_100g
});

// --- USDA bulk-download JSON extraction (nested nutrient.id/amount shape) ---

test("extractUsdaBulkFoodMacros reads the nested bulk-export shape", () => {
  const foodNutrients = [
    { nutrient: { id: 1003, name: "Protein" }, amount: 31 },
    { nutrient: { id: 1004, name: "Total lipid (fat)" }, amount: 3.6 },
    { nutrient: { id: 1005, name: "Carbohydrate, by difference" }, amount: 0 },
    { nutrient: { id: 1008, name: "Energy" }, amount: 165 },
  ];
  const macros = ctx.extractUsdaBulkFoodMacros(foodNutrients);
  assert.equal(macros.kcal, 165);
  assert.equal(macros.protein, 31);
  assert.equal(macros.fat, 3.6);
});

test("extractUsdaBulkFoodMacros also accepts the flat shape as a fallback", () => {
  const macros = ctx.extractUsdaBulkFoodMacros([{ nutrientId: 1008, value: 89 }]);
  assert.equal(macros.kcal, 89);
});

test("parseUsdaBulkDatasetToNutritionConfig maps a Foundation-Foods-shaped payload into our entries format", () => {
  const bulk = {
    FoundationFoods: [
      {
        description: "Chicken, breast, raw",
        foodNutrients: [
          { nutrient: { id: 1008 }, amount: 165 },
          { nutrient: { id: 1003 }, amount: 31 },
        ],
      },
      {
        description: "No energy data here",
        foodNutrients: [{ nutrient: { id: 1003 }, amount: 5 }],
      },
    ],
  };
  const config = ctx.parseUsdaBulkDatasetToNutritionConfig(bulk);
  assert.equal(config.entries["chicken breast raw"].kcal, 165);
  assert.equal(Object.keys(config.entries).length, 1); // the entry with no energy is skipped, not guessed
});

// --- ZIP extraction (hand-built buffers, not the real multi-MB download) ---

function buildMinimalZip({ content, compress }) {
  const nameBytes = Buffer.from("data.json", "utf8");
  const dataBytes = compress ? zlib.deflateRawSync(Buffer.from(content, "utf8")) : Buffer.from(content, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // general purpose flag (no streamed data descriptor)
  header.writeUInt16LE(compress ? 8 : 0, 8); // compression method
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(0, 14); // crc32 (unused by our reader)
  header.writeUInt32LE(dataBytes.length, 18); // compressed size
  header.writeUInt32LE(Buffer.byteLength(content), 22); // uncompressed size
  header.writeUInt16LE(nameBytes.length, 26); // file name length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBytes, dataBytes]);
}

test("extractFirstFileFromZip reads a deflate-compressed entry", () => {
  const zip = buildMinimalZip({ content: '{"hello":"world"}', compress: true });
  const extracted = ctx.extractFirstFileFromZip(zip);
  assert.equal(extracted.toString("utf8"), '{"hello":"world"}');
});

test("extractFirstFileFromZip reads a stored (uncompressed) entry", () => {
  const zip = buildMinimalZip({ content: '{"a":1}', compress: false });
  const extracted = ctx.extractFirstFileFromZip(zip);
  assert.equal(extracted.toString("utf8"), '{"a":1}');
});

test("extractFirstFileFromZip throws a clear error on a bad signature or unsupported compression", () => {
  assert.throws(() => ctx.extractFirstFileFromZip(Buffer.from("not a zip at all, way too short")), /ZIP/);

  const zip = buildMinimalZip({ content: "{}", compress: false });
  zip.writeUInt16LE(99, 8); // corrupt the compression method to something unsupported
  assert.throws(() => ctx.extractFirstFileFromZip(zip), /[Cc]ompression/);
});

// --- resolveMissingIngredientsViaLiveLookup (plugin method orchestration) ---

const ing = (name, extra = {}) => ({ name, canonicalName: name, unitMetric: "g", amountMetric: 100, quantityUnknown: false, ...extra });

function makeLiveLookupPlugin() {
  const files = new Map();
  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { nutritionLiveLookupEnabled: true, nutritionLiveLookupProvider: "usda", usdaApiKey: "test-key" };
  plugin.app = {
    vault: {
      adapter: {
        exists: async (p) => files.has(p),
        read: async (p) => {
          if (!files.has(p)) throw new Error(`missing file: ${p}`);
          return files.get(p);
        },
        write: async (p, content) => files.set(p, content),
      },
    },
  };
  return { plugin, files };
}

test("resolveMissingIngredientsViaLiveLookup does nothing when the feature is disabled", async () => {
  const { plugin } = makeLiveLookupPlugin();
  plugin.settings.nutritionLiveLookupEnabled = false;
  plugin.lookupIngredientMacrosLive = async () => { throw new Error("should not be called"); };

  const findings = await plugin.resolveMissingIngredientsViaLiveLookup([ing("mystery fruit")]);
  assert.equal(findings.length, 0);
});

test("resolveMissingIngredientsViaLiveLookup skips ingredients already resolvable locally and quantity-unknown lines", async () => {
  const { plugin } = makeLiveLookupPlugin();
  let calls = 0;
  plugin.lookupIngredientMacrosLive = async () => { calls += 1; return null; };

  await plugin.resolveMissingIngredientsViaLiveLookup([
    ing("chicken breast"), // already in the bundled dataset
    ing("something unknown", { quantityUnknown: true }),
  ]);
  assert.equal(calls, 0);
});

test("resolveMissingIngredientsViaLiveLookup caches a successful lookup so it resolves locally afterward", async () => {
  const { plugin, files } = makeLiveLookupPlugin();
  plugin.lookupIngredientMacrosLive = async (name) =>
    name === "dragonfruit" ? { kcal: 60, protein: 1.2, carbs: 13, fat: 0.4 } : null;

  const findings = await plugin.resolveMissingIngredientsViaLiveLookup([ing("dragonfruit")]);
  assert.equal(findings.length, 0);
  assert.equal(ctx.estimateIngredientMacrosPer100g("dragonfruit").kcal, 60);
  assert.ok(files.has(".obsidian/plugins/weekly-meal-shopper/nutrition-live-cache.json"));
  const cached = JSON.parse(files.get(".obsidian/plugins/weekly-meal-shopper/nutrition-live-cache.json"));
  assert.equal(cached.entries.dragonfruit.kcal, 60);
});

test("resolveMissingIngredientsViaLiveLookup surfaces a finding when the lookup finds nothing, without throwing", async () => {
  const { plugin } = makeLiveLookupPlugin();
  plugin.lookupIngredientMacrosLive = async () => null;

  const findings = await plugin.resolveMissingIngredientsViaLiveLookup([ing("completely unknown thing")]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, "live-lookup-failed");
});

test("lookupIngredientMacrosLive dispatches to the configured provider", async () => {
  const { plugin } = makeLiveLookupPlugin();
  plugin.settings.nutritionLiveLookupProvider = "openfoodfacts";
  // Real network functions return null without a live server; just confirm no throw / correct null contract per provider.
  const result = await plugin.lookupIngredientMacrosLive("anything");
  assert.equal(result, null);
});
