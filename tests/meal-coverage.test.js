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

test("computePlanningProfile: a single batch covering the week needs only 1 cook", () => {
  // recipe makes 6 portions, household of 4, planned 1x this week -> 4 portions needed <= 6 -> 1 cook
  const profile = ctx.computePlanningProfile({
    portionsPerCook: 6,
    portionsPerMeal: 4,
    frozenAvailable: 0,
    useFrozenFirst: true,
    plannedInstances: 1,
  });
  assert.equal(profile.plannedPortions, 4);
  assert.equal(profile.cooksNeeded, 1);
});

test("computePlanningProfile: planning it multiple times this week needs multiple batches", () => {
  // recipe makes 4 portions, household of 4, planned 3x this week -> 12 portions needed / 4 = 3 cooks
  const profile = ctx.computePlanningProfile({
    portionsPerCook: 4,
    portionsPerMeal: 4,
    frozenAvailable: 0,
    useFrozenFirst: true,
    plannedInstances: 3,
  });
  assert.equal(profile.plannedPortions, 12);
  assert.equal(profile.cooksNeeded, 3);
});

test("computePlanningProfile: frozen portions offset what needs cooking", () => {
  const profile = ctx.computePlanningProfile({
    portionsPerCook: 4,
    portionsPerMeal: 4,
    frozenAvailable: 4,
    useFrozenFirst: true,
    plannedInstances: 2,
  });
  assert.equal(profile.plannedPortions, 8);
  assert.equal(profile.frozenUsed, 4);
  assert.equal(profile.portionsNeedingCook, 4);
  assert.equal(profile.cooksNeeded, 1);
});

test("classifyMealCoverageStatus: covered when a single batch satisfies the week, short otherwise", () => {
  assert.equal(ctx.classifyMealCoverageStatus({ cooksNeeded: 0 }), "covered");
  assert.equal(ctx.classifyMealCoverageStatus({ cooksNeeded: 1 }), "covered");
  assert.equal(ctx.classifyMealCoverageStatus({ cooksNeeded: 2 }), "short");
  assert.equal(ctx.classifyMealCoverageStatus({ cooksNeeded: 5 }), "short");
});

function makePluginWithCanvas({ householdSize, canvasPath, canvasText, recipeFrontmatter }) {
  const filesByPath = new Map();
  filesByPath.set(canvasPath, makeFile(canvasPath, "canvas"));
  for (const path of Object.keys(recipeFrontmatter)) filesByPath.set(path, makeFile(path, "md"));

  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { householdSize };
  plugin.app = {
    vault: {
      getAbstractFileByPath: (p) => filesByPath.get(p) || null,
      read: async (file) => (file.path === canvasPath ? canvasText : ""),
      modify: async (file, content) => {
        plugin.__lastModify = { path: file.path, content };
      },
    },
    metadataCache: {
      getFileCache: (file) => ({ frontmatter: recipeFrontmatter[file.path] || {} }),
      getFirstLinkpathDest: () => null,
    },
  };
  return { plugin, canvasFile: filesByPath.get(canvasPath) };
}

test("computeMealCoverageForCanvas only counts default-section cards, ignoring Projects/Hosting", () => {
  return (async () => {
    const canvasText = canvasJson([
      { id: "g1", type: "group", label: "Projects", x: 1000, y: 0, width: 400, height: 400 },
      { id: "f1", type: "file", file: "Recipes/Stew.md", x: 0, y: 0, width: 100, height: 100 },
      { id: "f2", type: "file", file: "Recipes/Stew.md", x: 1050, y: 50, width: 100, height: 100 },
    ]);
    const { plugin, canvasFile } = makePluginWithCanvas({
      householdSize: 4,
      canvasPath: "Plan.canvas",
      canvasText,
      recipeFrontmatter: { "Recipes/Stew.md": { type: "Recipe", Portions: 6 } },
    });

    const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].plannedInstances, 1); // only the default-section card counts
    assert.equal(rows[0].recipePortions, 6);
  })();
});

test("computeMealCoverageForCanvas classifies status using household size", () => {
  return (async () => {
    const canvasText = canvasJson([
      { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
      { id: "f2", type: "file", file: "Recipes/Curry.md", x: 200, y: 0, width: 100, height: 100 },
      { id: "f3", type: "file", file: "Recipes/Curry.md", x: 400, y: 0, width: 100, height: 100 },
    ]);
    const { plugin, canvasFile } = makePluginWithCanvas({
      householdSize: 4,
      canvasPath: "Plan.canvas",
      canvasText,
      recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
    });

    // planned 3x, 4 portions per cook, household 4 -> needs 12 portions -> 3 cooks -> short
    const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
    assert.equal(rows[0].plannedInstances, 3);
    assert.equal(rows[0].cooksNeeded, 3);
    assert.equal(rows[0].status, "short");
  })();
});

test("syncCanvasCardColorsToCoverage colors default-section cards and skips Project/Hosting cards", () => {
  return (async () => {
    const canvasText = canvasJson([
      { id: "g1", type: "group", label: "Hosting", x: 1000, y: 0, width: 400, height: 400 },
      { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
      { id: "f2", type: "file", file: "Recipes/Curry.md", x: 1050, y: 50, width: 100, height: 100 },
    ]);
    const { plugin, canvasFile } = makePluginWithCanvas({
      householdSize: 4,
      canvasPath: "Plan.canvas",
      canvasText,
      recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
    });

    const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
    await plugin.syncCanvasCardColorsToCoverage(canvasFile, rows);

    assert.ok(plugin.__lastModify, "expected the canvas to be rewritten with a color change");
    const written = JSON.parse(plugin.__lastModify.content);
    const defaultCard = written.nodes.find((n) => n.id === "f1");
    const hostingCard = written.nodes.find((n) => n.id === "f2");
    assert.equal(defaultCard.color, "4"); // 1 planned instance, 4-portion recipe, household 4 -> covered -> green
    assert.equal(hostingCard.color, undefined); // untouched, not part of the default weekly section
  })();
});

test("syncCanvasCardColorsToCoverage is a no-op once colors already match (breaks the modify-listener feedback loop)", () => {
  return (async () => {
    const canvasText = canvasJson([
      { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100, color: "4" },
    ]);
    const { plugin, canvasFile } = makePluginWithCanvas({
      householdSize: 4,
      canvasPath: "Plan.canvas",
      canvasText,
      recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
    });

    const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
    await plugin.syncCanvasCardColorsToCoverage(canvasFile, rows);

    assert.equal(plugin.__lastModify, undefined, "no write should happen when colors are already correct");
  })();
});
