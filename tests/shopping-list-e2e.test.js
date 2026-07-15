const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;
const TFile = ctx.__obsidian.TFile;

function makeFile(path, extension) {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").pop().replace(/\.[^.]+$/, "");
  file.extension = extension;
  return file;
}

const ing = (name, unitMetric, amountMetric, extra = {}) => ({
  name,
  canonicalName: name,
  unitMetric,
  amountMetric,
  quantityUnknown: false,
  ...extra,
});

function canvasJson(recipePaths) {
  return JSON.stringify({
    nodes: recipePaths.map((p, i) => ({ id: `n${i}`, type: "file", file: p, x: 0, y: i * 100, width: 200, height: 80 })),
    edges: [],
  });
}

// Builds a fake Obsidian app + plugin instance and runs the real
// generateWeeklyShoppingList, returning the markdown it would write.
async function runShoppingList({ settings, canvases, recipeFrontmatter, ingredientsByPath }) {
  const filesByPath = new Map();
  for (const c of canvases) filesByPath.set(c.path, makeFile(c.path, "canvas"));
  for (const path of Object.keys(recipeFrontmatter)) filesByPath.set(path, makeFile(path, "md"));

  const canvasTextByPath = new Map(canvases.map((c) => [c.path, c.text]));
  let written = null;

  const app = {
    workspace: {
      getActiveFile: () => null,
      getLeaf: () => ({ openFile: async () => {} }),
    },
    vault: {
      getAbstractFileByPath: (p) => filesByPath.get(p) || null,
      getMarkdownFiles: () => [...filesByPath.values()].filter((f) => f.extension === "md"),
      read: async (file) => canvasTextByPath.get(file.path) || "",
      create: async (path, content) => { written = { path, content }; return makeFile(path, "md"); },
      modify: async (file, content) => { written = { path: file.path, content }; },
    },
    metadataCache: {
      getFileCache: (file) => ({ frontmatter: recipeFrontmatter[file.path] || {} }),
      getFirstLinkpathDest: () => null,
    },
    fileManager: { processFrontMatter: async () => {} },
  };

  const plugin = Object.create(PluginClass.prototype);
  plugin.app = app;
  plugin.settings = settings;
  plugin.getRecipeIngredients = async (file) => (ingredientsByPath[file.path] || []).map((x) => ({ ...x }));
  plugin.loadIngredientCategoryConfig = async () => ctx.normalizeCategoryConfig({});

  await plugin.generateWeeklyShoppingList({});
  assert.ok(written, "expected the shopping list to be written");
  return written.content;
}

const baseSettings = () => ({
  weeklyCanvasPath: "Plan.canvas",
  weeklyCanvasPath2: "",
  splitShoppingListByCanvas: false,
  shoppingListOutputPath: "Out.md",
  excludedIngredientsExact: [],
  ingredientOverrides: [],
  showRecipeUsageInShoppingList: false,
  includeOverrideLinksInShoppingList: false,
  legumeShoppingMode: "canned",
});

test("aggregates ingredients across recipes into a grouped checklist", async () => {
  const md = await runShoppingList({
    settings: baseSettings(),
    canvases: [{ path: "Plan.canvas", text: canvasJson(["Recipes/Bean Stew.md", "Recipes/Tomato Soup.md"]) }],
    recipeFrontmatter: {
      "Recipes/Bean Stew.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
      "Recipes/Tomato Soup.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
    },
    ingredientsByPath: {
      "Recipes/Bean Stew.md": [ing("chickpeas", "unit", 2), ing("carrot", "unit", 3), ing("cumin", "ml", 5)],
      "Recipes/Tomato Soup.md": [ing("tomato", "g", 800), ing("carrot", "unit", 2)],
    },
  });

  // carrot totals 3 + 2 = 5 across both recipes
  assert.match(md, /\(5\) carrots/);
  assert.match(md, /\(2\) chickpeas/);
  assert.match(md, /\(800 g\) tomato/);
  // cumin is a tiny spice amount -> shown without a quantity
  assert.match(md, /- \[ \] cumin/);
  assert.match(md, /## Shopping Checklist/);
});

test("dried-legume mode converts cans to a dried g + ml line", async () => {
  const settings = baseSettings();
  settings.legumeShoppingMode = "dried";
  const md = await runShoppingList({
    settings,
    canvases: [{ path: "Plan.canvas", text: canvasJson(["Recipes/Bean Stew.md"]) }],
    recipeFrontmatter: { "Recipes/Bean Stew.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 } },
    ingredientsByPath: { "Recipes/Bean Stew.md": [ing("chickpeas", "unit", 2)] },
  });

  assert.match(md, /\(170 g \/ 213 ml\) dried chickpeas/);
  assert.doesNotMatch(md, /\(2\) chickpeas/);
});

test("split-by-canvas mode emits one checklist section per canvas", async () => {
  const settings = baseSettings();
  settings.weeklyCanvasPath2 = "Plan 2.canvas";
  settings.splitShoppingListByCanvas = true;
  const md = await runShoppingList({
    settings,
    canvases: [
      { path: "Plan.canvas", text: canvasJson(["Recipes/Bean Stew.md"]) },
      { path: "Plan 2.canvas", text: canvasJson(["Recipes/Tomato Soup.md"]) },
    ],
    recipeFrontmatter: {
      "Recipes/Bean Stew.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
      "Recipes/Tomato Soup.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
    },
    ingredientsByPath: {
      "Recipes/Bean Stew.md": [ing("chickpeas", "unit", 2)],
      "Recipes/Tomato Soup.md": [ing("tomato", "g", 800)],
    },
  });

  assert.match(md, /### Plan\b/);
  assert.match(md, /### Plan 2\b/);
  // each canvas's ingredient sits under its own section
  const planIdx = md.indexOf("### Plan\n") !== -1 ? md.indexOf("### Plan\n") : md.indexOf("### Plan ");
  const plan2Idx = md.indexOf("### Plan 2");
  const chickpeaIdx = md.indexOf("chickpeas");
  const tomatoIdx = md.indexOf("tomato");
  assert.ok(planIdx < chickpeaIdx && chickpeaIdx < plan2Idx, "chickpeas under canvas 1");
  assert.ok(tomatoIdx > plan2Idx, "tomato under canvas 2");
});
