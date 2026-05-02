const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("standardize current recipe format can use API-assisted ingredient and direction alignment", async () => {
  const plugin = new PluginClass();
  let content = [
    "---",
    "type: Recipe",
    "---",
    "### Ingredients",
    "- zest and juice of 1 orange",
    "---",
    "### Directions",
    "1. Add to dressing.",
    "---",
    "### Notes",
    "",
    "---",
    "### Nutrition",
    "",
    "---",
    "### Log",
    "",
    "---",
    "### Tags",
    "",
  ].join("\n");

  plugin.settings = {
    parsedIngredientsField: "IngredientsParsed",
    ingredientStorageSeparator: ";",
    recipeViewIngredientDisplayTemplate: "{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}",
    measurementPreset: "vault_standard",
    measurementPreference: "weight",
    cupMl: 250,
    tbspMl: 15,
    tspMl: 5,
    convertLiquidVolumeMeasuresToWeight: true,
    transcriptionModel: "gpt-4.1-mini",
  };
  plugin.parsedIngredientCache = new Map();
  plugin.resolveTranscriptionApiKey = async () => "test-key";
  plugin.requestOpenAIResponsesWithRetry = async () => ({
    json: {
      output_text: JSON.stringify({
        ingredients: ["1 orange, zested and juiced"],
        directions: ["Add the orange to the dressing."],
      }),
    },
  });

  const file = {
    path: "pages/Orange Dressing.md",
    basename: "Orange Dressing",
    extension: "md",
    stat: { mtime: 1, size: content.length },
  };

  plugin.app = {
    vault: {
      read: async () => content,
      modify: async (_file, next) => {
        content = next;
        file.stat = { ...file.stat, size: next.length };
      },
    },
    fileManager: {
      processFrontMatter: async () => {},
    },
  };

  const changed = await plugin.standardizeRecipeFile(file, { useOpenAI: true });

  assert.equal(changed, true);
  assert.match(content, /- 1; ; orange; zested and juiced/);
  assert.match(content, /1\. Add the \*\*orange\*\* to the dressing\./);
});
