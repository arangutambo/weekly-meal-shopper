const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("createRecipeFromTemplate creates a duplicate-safe recipe note from the hardcoded template", async () => {
  const plugin = new PluginClass();
  let ensuredFolder = "";
  const opened = [];
  const files = new Map([
    ["pages/My Pasta.md", { path: "pages/My Pasta.md" }],
  ]);
  const templateContent = "---\nCustom: true\n---\n### Ingredients\n- \n";

  plugin.settings = {
    recipeFolder: "pages",
    transcriptionOutputFolder: "pages/Food and Drink/Recipes",
    recipeTemplateVaultPath: "Templates/Weekly Meal Shopper/Recipe Template.md",
  };
  plugin.promptTextEntry = async () => ({ value: "My Pasta" });
  plugin.ensureFolderPathExists = async (folder) => {
    ensuredFolder = folder;
  };
  plugin.app = {
    vault: {
      getAbstractFileByPath: (filePath) => files.get(filePath),
      create: async (filePath, content) => {
        const created = { path: filePath, content };
        files.set(filePath, created);
        return created;
      },
      adapter: {
        exists: async (filePath) => filePath === "Templates/Weekly Meal Shopper/Recipe Template.md",
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

  const created = await plugin.createRecipeFromTemplate();

  assert.equal(ensuredFolder, "pages");
  assert.equal(created.path, "pages/My Pasta 2.md");
  assert.equal(created.content, templateContent);
  assert.deepEqual(opened, ["pages/My Pasta 2.md"]);
});

test("populateEditableRecipeTemplateInVault creates the editable recipe template from the bundled base", async () => {
  const plugin = new PluginClass();
  const opened = [];
  const createdFiles = [];
  const bundledTemplate = "---\nBundled: true\n";

  plugin.settings = {
    recipeTemplateVaultPath: "Templates/Weekly Meal Shopper/Recipe Template.md",
  };
  plugin.app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: async (filePath, content) => {
        const created = { path: filePath, content };
        createdFiles.push(created);
        return created;
      },
      adapter: {
        exists: async (filePath) => filePath === ".obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md",
        read: async () => bundledTemplate,
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
  plugin.ensureParentFolderForFilePath = async () => {};

  const created = await plugin.populateEditableRecipeTemplateInVault();

  assert.equal(created.path, "Templates/Weekly Meal Shopper/Recipe Template.md");
  assert.equal(created.content, bundledTemplate);
  assert.deepEqual(opened, ["Templates/Weekly Meal Shopper/Recipe Template.md"]);
  assert.equal(createdFiles.length, 1);
});

test("runFirstTimeTemplateSetup saves both template paths and populates both editable templates", async () => {
  const plugin = new PluginClass();
  let saveCount = 0;
  const populateCalls = [];

  plugin.settings = {
    recipeTemplateVaultPath: "Templates/Weekly Meal Shopper/Recipe Template.md",
    mealPrepCanvasTemplateVaultPath: "Templates/Weekly Meal Shopper/Meal Prep Canvas Template.canvas",
  };
  plugin.promptTemplateSetup = async () => ({
    canvasPath: "Templates/Setup/Canvas.canvas",
    recipePath: "Templates/Setup/Recipe.md",
  });
  plugin.saveSettings = async () => {
    saveCount += 1;
  };
  plugin.populateEditableMealPrepCanvasTemplateInVault = async (options) => {
    populateCalls.push({ kind: "canvas", options });
    return { path: "Templates/Setup/Canvas.canvas" };
  };
  plugin.populateEditableRecipeTemplateInVault = async (options) => {
    populateCalls.push({ kind: "recipe", options });
    return { path: "Templates/Setup/Recipe.md" };
  };

  const result = await plugin.runFirstTimeTemplateSetup();

  assert.equal(plugin.settings.mealPrepCanvasTemplateVaultPath, "Templates/Setup/Canvas.canvas");
  assert.equal(plugin.settings.recipeTemplateVaultPath, "Templates/Setup/Recipe.md");
  assert.equal(saveCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(populateCalls)), [
    { kind: "canvas", options: { openFile: false, showNotice: false } },
    { kind: "recipe", options: { openFile: false, showNotice: false } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    canvasFile: { path: "Templates/Setup/Canvas.canvas" },
    recipeFile: { path: "Templates/Setup/Recipe.md" },
  });
});
