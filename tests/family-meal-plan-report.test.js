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

// Builds a canvas with one or more labeled groups (e.g. "Family: Alice"), each
// containing file-node recipe cards positioned inside the group's bounds.
function groupedCanvasJson(groups) {
  const nodes = [];
  groups.forEach((g, gi) => {
    nodes.push({ id: `g${gi}`, type: "group", label: g.label, x: g.x, y: g.y, width: g.width, height: g.height });
    g.recipes.forEach((recipePath, ri) => {
      nodes.push({
        id: `f${gi}_${ri}`,
        type: "file",
        file: recipePath,
        x: g.x + 10,
        y: g.y + 10 + ri * 50,
        width: 30,
        height: 30,
      });
    });
  });
  return JSON.stringify({ nodes, edges: [] });
}

async function runShoppingList({ settings, canvasText, recipeFrontmatter, ingredientsByPath }) {
  const filesByPath = new Map();
  filesByPath.set("Plan.canvas", makeFile("Plan.canvas", "canvas"));
  for (const path of Object.keys(recipeFrontmatter)) filesByPath.set(path, makeFile(path, "md"));

  let written = null;

  const app = {
    workspace: {
      getActiveFile: () => null,
      getLeaf: () => ({ openFile: async () => {} }),
    },
    vault: {
      getAbstractFileByPath: (p) => filesByPath.get(p) || null,
      getMarkdownFiles: () => [...filesByPath.values()].filter((f) => f.extension === "md"),
      read: async (file) => (file.path === "Plan.canvas" ? canvasText : ""),
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
  macrosEnabled: true,
  energyUnit: "kcal",
});

test("Family Meal Plan lists each person's assigned recipes with per-serving macros when TrackMacros is on", async () => {
  const canvasText = groupedCanvasJson([
    { label: "Family: Alice", x: 0, y: 0, width: 500, height: 500, recipes: ["Recipes/Bean Stew.md", "Recipes/Bean Stew.md"] },
    { label: "Family: Bob", x: 1000, y: 0, width: 500, height: 500, recipes: ["Recipes/Bean Stew.md"] },
  ]);

  const md = await runShoppingList({
    settings: baseSettings(),
    canvasText,
    recipeFrontmatter: {
      "Recipes/Bean Stew.md": {
        type: "Recipe",
        Portions: 4,
        FrozenPortionsAvailable: 0,
        TrackMacros: true,
        MacroKcalPerServing: 300,
        MacroProteinGPerServing: 20,
        MacroCarbsGPerServing: 30,
        MacroFatGPerServing: 10,
      },
    },
    ingredientsByPath: {
      "Recipes/Bean Stew.md": [ing("chickpeas", "unit", 2)],
    },
  });

  assert.match(md, /## Family Meal Plan/);
  assert.match(md, /### Alice/);
  assert.match(md, /### Bob/);
  assert.match(md, /Bean Stew\]\]: 2 serving\(s\)/);
  assert.match(md, /300 kcal, 20g protein, 30g carbs, 10g fat per serving/);
});

test("Family Meal Plan shows 'macros not tracked' when TrackMacros is off, and family batches still feed the shopping checklist", async () => {
  const canvasText = groupedCanvasJson([
    { label: "Family: Alice", x: 0, y: 0, width: 500, height: 500, recipes: ["Recipes/Tomato Soup.md"] },
  ]);

  const md = await runShoppingList({
    settings: baseSettings(),
    canvasText,
    recipeFrontmatter: {
      "Recipes/Tomato Soup.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
    },
    ingredientsByPath: {
      "Recipes/Tomato Soup.md": [ing("tomato", "g", 400)],
    },
  });

  assert.match(md, /macros not tracked for this recipe/);
  // 1 family serving of a 4-portion recipe -> 1 batch -> 400g tomato in the checklist
  assert.match(md, /\(400 g\) tomato/);
  assert.match(md, /## Shopping Checklist/);
});

test("recipes with no family-group cards don't appear in the Family Meal Plan section", async () => {
  const md = await runShoppingList({
    settings: baseSettings(),
    canvasText: JSON.stringify({
      nodes: [{ id: "f1", type: "file", file: "Recipes/Tomato Soup.md", x: 0, y: 0, width: 100, height: 100 }],
      edges: [],
    }),
    recipeFrontmatter: {
      "Recipes/Tomato Soup.md": { type: "Recipe", Portions: 4, FrozenPortionsAvailable: 0 },
    },
    ingredientsByPath: {
      "Recipes/Tomato Soup.md": [ing("tomato", "g", 400)],
    },
  });

  const familyIdx = md.indexOf("## Family Meal Plan");
  const checklistIdx = md.indexOf("## Shopping Checklist");
  assert.ok(familyIdx !== -1 && checklistIdx !== -1 && familyIdx < checklistIdx);
  const familySection = md.slice(familyIdx, checklistIdx);
  assert.match(familySection, /- None/);
});

test("energyUnit setting only changes the displayed number, not which recipes/servings are listed", async () => {
  const canvasText = groupedCanvasJson([
    { label: "Family: Alice", x: 0, y: 0, width: 500, height: 500, recipes: ["Recipes/Bean Stew.md"] },
  ]);
  const settings = baseSettings();
  settings.energyUnit = "kJ";

  const md = await runShoppingList({
    settings,
    canvasText,
    recipeFrontmatter: {
      "Recipes/Bean Stew.md": {
        type: "Recipe",
        Portions: 4,
        FrozenPortionsAvailable: 0,
        TrackMacros: true,
        MacroKcalPerServing: 100,
        MacroProteinGPerServing: 5,
        MacroCarbsGPerServing: 5,
        MacroFatGPerServing: 5,
      },
    },
    ingredientsByPath: { "Recipes/Bean Stew.md": [ing("chickpeas", "unit", 1)] },
  });

  // 100 kcal * 4.184 = 418.4 -> rounds to 418
  assert.match(md, /418 kJ/);
});
