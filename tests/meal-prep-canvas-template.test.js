const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("buildMealPrepCanvasFilename uses ISO week and ISO year placeholders", () => {
  const plugin = new PluginClass();
  plugin.settings = {
    mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
  };

  const fileName = plugin.buildMealPrepCanvasFilename(new Date("2026-11-03T12:00:00"));
  assert.equal(fileName, "⛑️ Weekly Meal Plan Week 45 2026.canvas");
});

test("loadSettings preserves an existing date-based canvas name template during updates", async () => {
  const plugin = new PluginClass();
  plugin.loadData = async () => ({
    mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan {{date}}.canvas",
  });

  await plugin.loadSettings();

  assert.equal(plugin.settings.mealPrepCanvasNameTemplate, "⛑️ Weekly Meal Plan {{date}}.canvas");
});

test("loadSettings preserves the both measurement preference", async () => {
  const plugin = new PluginClass();
  plugin.loadData = async () => ({
    measurementPreference: "both",
  });

  await plugin.loadSettings();

  assert.equal(plugin.settings.measurementPreference, "both");
});

test("loadSettings seeds fresh installs with default excluded pantry ingredients", async () => {
  const plugin = new PluginClass();
  plugin.loadData = async () => ({});

  await plugin.loadSettings();

  assert.deepEqual(
    Array.from(plugin.settings.excludedIngredientsExact || []),
    ["black pepper", "salt", "water"]
  );
});

test("loadSettings folds legacy transcription output folder into recipeFolder", async () => {
  const plugin = new PluginClass();
  plugin.loadData = async () => ({
    recipeFolder: "",
    transcriptionOutputFolder: "pages/Imported Recipes",
  });

  await plugin.loadSettings();

  assert.equal(plugin.settings.recipeFolder, "pages/Imported Recipes");
  assert.equal("transcriptionOutputFolder" in plugin.settings, false);
});

test("loadSettings migrates the legacy shopping-list toggle into recipe usage display", async () => {
  const plugin = new PluginClass();
  plugin.loadData = async () => ({
    showCategoryReasonsInShoppingList: false,
  });

  await plugin.loadSettings();

  assert.equal(plugin.settings.showRecipeUsageInShoppingList, false);
  assert.equal("showCategoryReasonsInShoppingList" in plugin.settings, false);
});

test("saveSettings strips legacy mode flags from persisted settings", async () => {
  const plugin = new PluginClass();
  let saved = null;

  plugin.settings = {
    workflowPreset: "balanced",
    featureBasicEnabled: true,
    featureMealPrepEnabled: true,
    transcriptionOutputFolder: "pages/Imported Recipes",
    showCategoryReasonsInShoppingList: false,
    settingsImportExportPath: ".obsidian/plugins/weekly-meal-shopper/settings-export.json",
    settingsSectionState: {
      workflowModeCollapsed: true,
      settingsImportExportCollapsed: true,
      firstTimeSetupCollapsed: false,
    },
    showRecipeUsageInShoppingList: true,
    ingredientLineTemplate: "{{Amount}} {{Unit}} {{Ingredient}}",
    measurementPreset: "vault_standard",
    measurementPreference: "weight",
    cupMl: 250,
    tbspMl: 15,
    tspMl: 5,
    tbspShorthand: "tablespoon",
    tspShorthand: "teaspoon",
  };
  plugin.saveData = async (value) => {
    saved = JSON.parse(JSON.stringify(value));
  };

  await plugin.saveSettings();

  assert.equal("workflowPreset" in saved, false);
  assert.equal("featureBasicEnabled" in saved, false);
  assert.equal("featureMealPrepEnabled" in saved, false);
  assert.equal("transcriptionOutputFolder" in saved, false);
  assert.equal("showCategoryReasonsInShoppingList" in saved, false);
  assert.equal("cupShorthand" in saved, false);
  assert.equal("tbspShorthand" in saved, false);
  assert.equal("tspShorthand" in saved, false);
  assert.equal("ingredientLineTemplate" in saved, false);
  assert.equal("settingsImportExportPath" in saved, false);
  assert.equal("workflowModeCollapsed" in saved.settingsSectionState, false);
  assert.equal("settingsImportExportCollapsed" in saved.settingsSectionState, false);
  assert.equal(saved.showRecipeUsageInShoppingList, true);
  assert.equal(saved.ingredientStorageSeparator, ";");
  assert.equal(
    saved.recipeViewIngredientDisplayTemplate,
    "{{Amount}} {{Unit}} {{Ingredient}}"
  );
});

test("createWeeklyMealPrepCanvas copies the plugin canvas template into the target folder", async () => {
  const plugin = new PluginClass();
  const createdFiles = [];
  const opened = [];
  const templateContent = "{\n  \"nodes\": [\n    {\"id\": \"group-1\", \"type\": \"group\"}\n  ],\n  \"edges\": []\n}\n";

  plugin.settings = {
    mealPrepCanvasFolder: "Utility",
    mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
    mealPrepCanvasTemplateVaultPath: "Templates/Weekly Meal Shopper/Meal Prep Canvas Template.canvas",
  };
  plugin.ensureFolderPathExists = async () => {};
  plugin.saveSettings = async () => {};
  plugin.buildMealPrepCanvasFilename = () => "⛑️ Weekly Meal Plan Week 45 2026.canvas";
  plugin.app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: async (filePath, content) => {
        const created = { path: filePath, content };
        createdFiles.push(created);
        return created;
      },
      adapter: {
        exists: async (filePath) =>
          filePath === "Templates/Weekly Meal Shopper/Meal Prep Canvas Template.canvas",
        read: async () => templateContent,
      },
    },
    workspace: {
      getLeaf: () => ({
        openFile: async (file) => {
          opened.push(file.path);
        },
      }),
    },
  };

  const created = await plugin.createWeeklyMealPrepCanvas();

  assert.equal(created.path, "Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas");
  assert.equal(created.content, templateContent);
  assert.equal(plugin.settings.weeklyCanvasPath, "Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas");
  assert.deepEqual(opened, ["Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas"]);
  assert.equal(createdFiles.length, 1);
});

test("bundled meal-prep canvas template keeps the scaffold but ships without recipe cards", () => {
  const templatePath = path.resolve(__dirname, "..", "templates", "meal-prep-canvas-template.canvas");
  const parsed = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

  assert.ok(nodes.length > 0);
  assert.ok(nodes.every((node) => node.type === "group"));
  assert.equal(nodes.some((node) => node.type === "file"), false);
});
