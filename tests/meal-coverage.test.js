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

test("normalizeWeekStartDay accepts any weekday name and falls back to saturday", () => {
  assert.equal(ctx.normalizeWeekStartDay("monday"), "monday");
  assert.equal(ctx.normalizeWeekStartDay("Sunday"), "sunday");
  assert.equal(ctx.normalizeWeekStartDay("nonsense"), "saturday");
  assert.equal(ctx.normalizeWeekStartDay(""), "saturday");
});

test("getOrderedWeekdays rotates Sun..Sat so index 0 is the start day", () => {
  // Array/object literals compared against ctx.* return values need
  // field-by-field or string comparison, not deepEqual — the vm sandbox's
  // Array/Object come from a different realm than this outer literal, so
  // deepEqual's [[Prototype]] check fails even when contents match.
  assert.equal(Array.from(ctx.getOrderedWeekdays("monday")).join(","), "monday,tuesday,wednesday,thursday,friday,saturday,sunday");
  assert.equal(Array.from(ctx.getOrderedWeekdays("saturday")).join(","), "saturday,sunday,monday,tuesday,wednesday,thursday,friday");
});

test("weekdayRank ranks chronologically from the start day, unknown days sort last", () => {
  assert.equal(ctx.weekdayRank("saturday", "saturday"), 0);
  assert.equal(ctx.weekdayRank("sunday", "saturday"), 1);
  assert.equal(ctx.weekdayRank("friday", "saturday"), 6);
  assert.equal(ctx.weekdayRank(null, "saturday"), 999);
  assert.equal(ctx.weekdayRank("notaday", "saturday"), 999);
});

test("findContainingWeekdayLabel / findContainingMealTypeLabel identify the grid cell a card sits in", () => {
  const groups = [
    { label: "Monday", x: 0, y: 0, width: 200, height: 1000 },
    { label: "Tuesday", x: 200, y: 0, width: 200, height: 1000 },
    { label: "Dinner", x: -100, y: 100, width: 500, height: 100 },
    { label: "Hosting", x: 1000, y: 0, width: 200, height: 200 },
  ];
  const cardInMondayDinner = { x: 50, y: 130, width: 20, height: 20 };
  const cardInHosting = { x: 1050, y: 50, width: 20, height: 20 };

  assert.equal(ctx.findContainingWeekdayLabel(cardInMondayDinner, groups), "monday");
  assert.equal(ctx.findContainingMealTypeLabel(cardInMondayDinner, groups), "Dinner");
  // Hosting isn't a weekday group and isn't "default", so it's never returned as a meal type.
  assert.equal(ctx.findContainingWeekdayLabel(cardInHosting, groups), null);
  assert.equal(ctx.findContainingMealTypeLabel(cardInHosting, groups), null);
});

test("applyWeekStartDayToCanvasTemplate reassigns weekday labels to the existing slot geometry only", () => {
  const template = canvasJson([
    { id: "a", type: "group", label: "Monday", x: 0, y: 0, width: 100, height: 100 },
    { id: "b", type: "group", label: "Tuesday", x: 100, y: 0, width: 120, height: 100 },
    { id: "c", type: "group", label: "Wednesday", x: 220, y: 0, width: 90, height: 100 },
    { id: "d", type: "group", label: "Dinner", x: 0, y: 100, width: 310, height: 50 },
  ]);

  const rewritten = JSON.parse(ctx.applyWeekStartDayToCanvasTemplate(template, "wednesday"));
  const byId = Object.fromEntries(rewritten.nodes.map((n) => [n.id, n]));

  // Leftmost slot (x=0) now shows the configured start day...
  assert.equal(byId.a.label, "Wednesday");
  assert.equal(byId.b.label, "Thursday");
  assert.equal(byId.c.label, "Friday");
  // ...but geometry (x/width) and non-weekday groups are untouched.
  assert.equal(byId.a.x, 0);
  assert.equal(byId.b.width, 120);
  assert.equal(byId.d.label, "Dinner");
});

test("applyWeekStartDayToCanvasTemplate leaves unparseable or day-less templates unchanged", () => {
  assert.equal(ctx.applyWeekStartDayToCanvasTemplate("{ not json", "monday"), "{ not json");
  const noWeekdays = canvasJson([{ id: "a", type: "group", label: "Hosting", x: 0, y: 0, width: 10, height: 10 }]);
  assert.equal(ctx.applyWeekStartDayToCanvasTemplate(noWeekdays, "monday"), noWeekdays);
});

function makePluginWithCanvas({ householdSize, weekStartDay, canvasPath, canvasText, recipeFrontmatter }) {
  const filesByPath = new Map();
  filesByPath.set(canvasPath, makeFile(canvasPath, "canvas"));
  for (const path of Object.keys(recipeFrontmatter)) filesByPath.set(path, makeFile(path, "md"));

  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { householdSize, weekStartDay, coverageAcknowledgedShort: {} };
  plugin.saveSettings = async () => {}; // bypass the real normalization pipeline for these unit tests
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

test("computeMealCoverageForCanvas only counts default-section cards, ignoring Projects/Hosting", async () => {
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
  assert.equal(rows[0].plannedInstances, 1);
  assert.equal(rows[0].recipePortions, 6);
});

test("computeMealCoverageForCanvas classifies status using household size", async () => {
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

  // planned 3x, 4 portions per cook, household 4 -> needs 12 portions -> 3 cooks -> red (unacknowledged short)
  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].plannedInstances, 3);
  assert.equal(rows[0].cooksNeeded, 3);
  assert.equal(rows[0].status, "red");
});

test("a recipe's ServingMultiplier scales how many household-size portions one planned instance needs", async () => {
  // Same shape as the previous test, but this recipe only needs half a
  // normal household-size portion per instance (e.g. a fruit side dish) —
  // 3 planned instances x (4 household x 0.5) = 6 portions needed, and a
  // single 4-portion batch no longer covers it (still short, but less short).
  const canvasText = canvasJson([
    { id: "f1", type: "file", file: "Recipes/Fruit.md", x: 0, y: 0, width: 100, height: 100 },
    { id: "f2", type: "file", file: "Recipes/Fruit.md", x: 200, y: 0, width: 100, height: 100 },
    { id: "f3", type: "file", file: "Recipes/Fruit.md", x: 400, y: 0, width: 100, height: 100 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: { "Recipes/Fruit.md": { type: "Recipe", Portions: 4, ServingMultiplier: 0.5 } },
  });

  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].plannedInstances, 3);
  assert.equal(rows[0].cooksNeeded, 2); // 6 portions needed / 4 per batch -> 2 batches, not 3
});

test("ServingMultiplier defaults to 1 (no change) when the frontmatter field is absent", async () => {
  const canvasText = canvasJson([
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
  });

  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].cooksNeeded, 1); // 1 planned x 4 household = 4 needed, exactly covered by the 4-portion batch
});

test("computeMealCoverageForCanvas identifies which day/meal the next un-covered instance falls on", async () => {
  const canvasText = canvasJson([
    { id: "gDinner", type: "group", label: "Dinner", x: -100, y: -100, width: 2000, height: 300 },
    { id: "gMon", type: "group", label: "Monday", x: 0, y: -200, width: 200, height: 800 },
    { id: "gTue", type: "group", label: "Tuesday", x: 300, y: -200, width: 200, height: 800 },
    { id: "gWed", type: "group", label: "Wednesday", x: 600, y: -200, width: 200, height: 800 },
    // household 4, 4-portion recipe -> covers 1 instance per batch; planned Mon/Tue/Wed -> 2nd instance (Tue) is first uncovered
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 50, y: -50, width: 50, height: 50 },
    { id: "f2", type: "file", file: "Recipes/Curry.md", x: 350, y: -50, width: 50, height: 50 },
    { id: "f3", type: "file", file: "Recipes/Curry.md", x: 650, y: -50, width: 50, height: 50 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    weekStartDay: "saturday",
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
  });

  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "red");
  assert.equal(rows[0].nextCookInstance.day, "tuesday");
  assert.equal(rows[0].nextCookInstance.mealType, "Dinner");
});

test("toggleCoverageAcknowledgment turns a red row yellow, and it stays yellow on recompute", async () => {
  const canvasText = canvasJson([
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
    { id: "f2", type: "file", file: "Recipes/Curry.md", x: 200, y: 0, width: 100, height: 100 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
  });

  let rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "red");

  await plugin.toggleCoverageAcknowledgment(canvasFile, "Recipes/Curry.md");
  rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "yellow");

  // toggling again reverts it
  await plugin.toggleCoverageAcknowledgment(canvasFile, "Recipes/Curry.md");
  rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "red");
});

test("acknowledgment is automatically cleared once the recipe becomes fully covered again", async () => {
  const shortCanvas = canvasJson([
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
    { id: "f2", type: "file", file: "Recipes/Curry.md", x: 200, y: 0, width: 100, height: 100 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    canvasPath: "Plan.canvas",
    canvasText: shortCanvas,
    recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
  });

  await plugin.toggleCoverageAcknowledgment(canvasFile, "Recipes/Curry.md");
  let rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "yellow");

  // Recipe now only planned once -> fully covered -> acknowledgment should be dropped
  plugin.app.vault.read = async (file) =>
    file.path === "Plan.canvas"
      ? canvasJson([{ id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 }])
      : "";
  rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].status, "green");
  assert.equal((plugin.settings.coverageAcknowledgedShort["Plan.canvas"] || []).length, 0);
});

test("rows sort red before yellow before green, and chronologically within each tier", async () => {
  const canvasText = canvasJson([
    { id: "gMon", type: "group", label: "Monday", x: 0, y: -200, width: 200, height: 800 },
    { id: "gTue", type: "group", label: "Tuesday", x: 300, y: -200, width: 200, height: 800 },
    // Soup: planned once, 8-portion recipe, household 4 -> covered -> green, on Tuesday
    { id: "soup", type: "file", file: "Recipes/Soup.md", x: 350, y: -100, width: 50, height: 50 },
    // Stew: planned once on Monday but only makes 2 portions for a household of 4 -> red
    { id: "stew", type: "file", file: "Recipes/Stew.md", x: 50, y: -100, width: 50, height: 50 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    weekStartDay: "saturday",
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: {
      "Recipes/Soup.md": { type: "Recipe", Portions: 8 },
      "Recipes/Stew.md": { type: "Recipe", Portions: 2 },
    },
  });

  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  assert.equal(rows[0].file.basename, "Stew"); // red, sorts first even though it's on the earlier day
  assert.equal(rows[0].status, "red");
  assert.equal(rows[1].file.basename, "Soup");
  assert.equal(rows[1].status, "green");
});

test("syncCanvasCardColorsToCoverage colors default-section cards and skips Project/Hosting cards", async () => {
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
});

test("syncCanvasCardColorsToCoverage uses yellow for acknowledged short recipes", async () => {
  const canvasText = canvasJson([
    { id: "f1", type: "file", file: "Recipes/Curry.md", x: 0, y: 0, width: 100, height: 100 },
    { id: "f2", type: "file", file: "Recipes/Curry.md", x: 200, y: 0, width: 100, height: 100 },
  ]);
  const { plugin, canvasFile } = makePluginWithCanvas({
    householdSize: 4,
    canvasPath: "Plan.canvas",
    canvasText,
    recipeFrontmatter: { "Recipes/Curry.md": { type: "Recipe", Portions: 4 } },
  });

  await plugin.toggleCoverageAcknowledgment(canvasFile, "Recipes/Curry.md");
  const rows = await plugin.computeMealCoverageForCanvas(canvasFile);
  await plugin.syncCanvasCardColorsToCoverage(canvasFile, rows);

  const written = JSON.parse(plugin.__lastModify.content);
  assert.equal(written.nodes.find((n) => n.id === "f1").color, "3");
});

test("syncCanvasCardColorsToCoverage is a no-op once colors already match (breaks the modify-listener feedback loop)", async () => {
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
});
