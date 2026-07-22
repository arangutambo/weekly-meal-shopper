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

function canvasJson(nodes) {
  return JSON.stringify({ nodes, edges: [] });
}

function makePluginWithCanvas({ weekStartDay, canvasPath, canvasText, recipeFrontmatter }) {
  const filesByPath = new Map();
  filesByPath.set(canvasPath, makeFile(canvasPath, "canvas"));
  for (const path of Object.keys(recipeFrontmatter)) filesByPath.set(path, makeFile(path, "md"));

  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { weekStartDay };
  plugin.app = {
    vault: {
      getAbstractFileByPath: (p) => filesByPath.get(p) || null,
      read: async (file) => (file.path === canvasPath ? canvasText : ""),
    },
    metadataCache: {
      getFileCache: (file) => ({ frontmatter: recipeFrontmatter[file.path] || {} }),
      getFirstLinkpathDest: () => null,
    },
  };
  return { plugin, canvasFile: filesByPath.get(canvasPath) };
}

test("computeMacroDetailsForCanvas sums calculated macros per day, only for cards inside a weekday group", async () => {
  const canvasText = canvasJson([
    { id: "gMon", type: "group", label: "Monday", x: 0, y: -200, width: 200, height: 800 },
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 50, y: -100, width: 50, height: 50 },
    { id: "f2", type: "file", file: "Recipes/Rice.md", x: 50, y: -50, width: 50, height: 50 },
    // no day column contains this one -> excluded entirely
    { id: "f3", type: "file", file: "Recipes/Curry.md", x: 900, y: 900, width: 50, height: 50 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    weekStartDay: "saturday",
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: {
      "Recipes/Curry.md": { TrackMacros: true, MacroKcalPerServing: 400, MacroProteinGPerServing: 30, MacroCarbsGPerServing: 20, MacroFatGPerServing: 15 },
      "Recipes/Rice.md": { TrackMacros: true, MacroKcalPerServing: 200, MacroProteinGPerServing: 4, MacroCarbsGPerServing: 45, MacroFatGPerServing: 1 },
    },
  });

  const days = await plugin.computeMacroDetailsForCanvas(canvasFile);
  assert.equal(days.length, 7);

  const monday = days.find((d) => d.day === "monday");
  assert.equal(monday.totalKcal, 600);
  assert.equal(monday.totalProtein, 34);
  assert.equal(monday.totalCarbs, 65);
  assert.equal(monday.totalFat, 16);
  assert.equal(monday.meals.length, 2);
  assert.equal(monday.uncalculatedCount, 0);

  // the card outside any day column contributed nothing anywhere
  const totalMealsAcrossWeek = days.reduce((sum, d) => sum + d.meals.length, 0);
  assert.equal(totalMealsAcrossWeek, 2);
});

test("computeMacroDetailsForCanvas counts recipes without calculated macros separately instead of as zero", async () => {
  const canvasText = canvasJson([
    { id: "gTue", type: "group", label: "Tuesday", x: 0, y: -200, width: 200, height: 800 },
    { id: "f1", type: "file", file: "Recipes/NoMacros.md", x: 50, y: -100, width: 50, height: 50 },
    { id: "f2", type: "file", file: "Recipes/Untracked.md", x: 50, y: -50, width: 50, height: 50 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    weekStartDay: "saturday",
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: {
      "Recipes/NoMacros.md": { TrackMacros: true }, // never calculated yet
      "Recipes/Untracked.md": { TrackMacros: false, MacroKcalPerServing: 0 },
    },
  });

  const days = await plugin.computeMacroDetailsForCanvas(canvasFile);
  const tuesday = days.find((d) => d.day === "tuesday");
  assert.equal(tuesday.totalKcal, 0);
  assert.equal(tuesday.meals.length, 0);
  assert.equal(tuesday.uncalculatedCount, 2);
});

test("computeMacroDetailsForCanvas records each meal's containing meal-type group label", async () => {
  const canvasText = canvasJson([
    { id: "gDinner", type: "group", label: "Dinner", x: -100, y: -100, width: 2000, height: 300 },
    { id: "gWed", type: "group", label: "Wednesday", x: 0, y: -200, width: 200, height: 800 },
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 50, y: -50, width: 50, height: 50 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    weekStartDay: "saturday",
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: {
      "Recipes/Curry.md": { TrackMacros: true, MacroKcalPerServing: 400, MacroProteinGPerServing: 30, MacroCarbsGPerServing: 20, MacroFatGPerServing: 15 },
    },
  });

  const days = await plugin.computeMacroDetailsForCanvas(canvasFile);
  const wednesday = days.find((d) => d.day === "wednesday");
  assert.equal(wednesday.meals[0].mealType, "Dinner");
  assert.equal(wednesday.meals[0].name, "Curry");
});

test("computeMacroDetailsForCanvas orders days starting from weekStartDay", async () => {
  const { plugin, canvasFile } = makePluginWithCanvas({
    weekStartDay: "monday",
    canvasPath: "Plan.canvas",
    canvasText: canvasJson([]),
    recipeFrontmatter: {},
  });

  const days = await plugin.computeMacroDetailsForCanvas(canvasFile);
  assert.equal(days.map((d) => d.day).join(","), "monday,tuesday,wednesday,thursday,friday,saturday,sunday");
});
