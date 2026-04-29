const fs = require("node:fs");
const path = require("node:path");
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

test("bundled recipe template no longer includes a Class frontmatter field", () => {
  const templatePath = path.resolve(__dirname, "..", "templates", "recipe-template.md");
  const content = fs.readFileSync(templatePath, "utf8");

  assert.equal(/\nClass:\s*Recipe\b/.test(content), false);
  assert.equal(/\ntype:\s*Recipe\b/.test(content), true);
});

test("buildTranscribedRecipeNoteContent omits the Class frontmatter field", () => {
  const plugin = new PluginClass();

  const content = plugin.buildTranscribedRecipeNoteContent({
    ingredients: ["1 cup flour"],
    directions: ["Mix everything."],
    notes: [],
    cookTime: "",
    prepTime: "",
    portions: "",
    cover: "",
    link: "",
  });

  assert.equal(content.includes("Class: Recipe"), false);
  assert.equal(content.includes("type: Recipe"), true);
});

test("standardizeRecipeFile removes the Class frontmatter field from existing notes", async () => {
  const plugin = new PluginClass();
  let content = [
    "---",
    "Class: Recipe",
    "type: Recipe",
    "---",
    "### Ingredients",
    "- 1 cup flour",
    "---",
    "### Directions",
    "1. Mix everything.",
    "",
  ].join("\n");

  const parseFrontmatterBlock = (source) => {
    const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return {};
    const out = {};
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  };

  const serializeFrontmatterBlock = (frontmatter) => {
    const lines = [];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
          continue;
        }
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${item}`);
        continue;
      }
      lines.push(`${key}: ${value}`);
    }
    return `---\n${lines.join("\n")}\n---`;
  };

  plugin.settings = {
    parsedIngredientsField: "IngredientsParsed",
  };
  plugin.app = {
    vault: {
      read: async () => content,
      modify: async (_file, nextContent) => {
        content = nextContent;
      },
    },
    fileManager: {
      processFrontMatter: async (_file, updater) => {
        const frontmatter = parseFrontmatterBlock(content);
        updater(frontmatter);
        const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
        content = `${serializeFrontmatterBlock(frontmatter)}\n${body}`;
      },
    },
  };

  const changed = await plugin.standardizeRecipeFile({ path: "pages/Test Recipe.md" });

  assert.equal(changed, true);
  assert.equal(content.includes("Class: Recipe"), false);
  assert.equal(content.includes("\ntype: Recipe"), true);
});
