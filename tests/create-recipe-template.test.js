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

  plugin.settings = {
    recipeFolder: "pages",
    transcriptionOutputFolder: "pages/Food and Drink/Recipes",
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
  assert.match(created.content, /^---\ntags:\n  - 🧠\/🍽️\/📄\nCookTime: /);
  assert.match(created.content, /### Ingredients\n- \n---\n### Directions\n1\. /);
  assert.match(created.content, /```dataview\nTASK\nWHERE icontains\(text, this\.file\.name\)/);
  assert.deepEqual(opened, ["pages/My Pasta 2.md"]);
});
