const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;
const TFile = ctx.__obsidian.TFile;

function makeFile(path) {
  const file = new TFile();
  file.path = path;
  file.basename = path.split("/").pop().replace(/\.[^.]+$/, "");
  file.extension = "md";
  return file;
}

const ing = (name, unitMetric, amountMetric) => ({
  name, canonicalName: name, unitMetric, amountMetric, quantityUnknown: false,
});

function makePlugin({ macrosEnabled, frontmatter, noteContent }) {
  const file = makeFile("Recipes/Curry.md");
  const vaultFiles = new Map(); // config-file adapter storage
  let currentFrontmatter = { ...frontmatter };
  let currentContent = noteContent;
  let lastWrittenContent = null;

  const plugin = Object.create(PluginClass.prototype);
  plugin.settings = { macrosEnabled, energyUnit: "kcal", nutritionLiveLookupEnabled: false };
  plugin.getRecipeIngredients = async () => [ing("chicken breast", "g", 200)];
  plugin.app = {
    metadataCache: { getFileCache: () => ({ frontmatter: currentFrontmatter }) },
    fileManager: {
      processFrontMatter: async (_file, updater) => {
        updater(currentFrontmatter);
      },
    },
    vault: {
      read: async () => currentContent,
      modify: async (_file, content) => {
        currentContent = content;
        lastWrittenContent = content;
      },
      getMarkdownFiles: () => [file],
      adapter: {
        exists: async (p) => vaultFiles.has(p),
        read: async (p) => {
          if (!vaultFiles.has(p)) throw new Error(`missing file: ${p}`);
          return vaultFiles.get(p);
        },
        write: async (p, content) => vaultFiles.set(p, content),
      },
    },
  };

  return { plugin, file, getFrontmatter: () => currentFrontmatter, getLastWrittenContent: () => lastWrittenContent };
}

const RECIPE_BODY = [
  "### Ingredients",
  "- 200 g chicken breast",
  "---",
  "### Notes",
  "",
  "---",
  "### Nutrition",
  "",
  "---",
].join("\n");

test("calculateRecipeMacros automatically sets TrackMacros: true when it's off, instead of refusing to run", async () => {
  const { plugin, file, getFrontmatter } = makePlugin({
    macrosEnabled: true,
    frontmatter: { type: "Recipe", Portions: 2 }, // TrackMacros absent
    noteContent: RECIPE_BODY,
  });

  const result = await plugin.calculateRecipeMacros(file, { silent: true });

  assert.equal(getFrontmatter().TrackMacros, true);
  assert.ok(result, "expected macros to actually be calculated, not skipped");
  // chicken breast is 165 kcal/100g; 200g total / 2 portions -> 165 kcal/serving.
  assert.equal(getFrontmatter().MacroKcalPerServing, 165);
});

test("calculateRecipeMacros still refuses to run when macro tracking is disabled globally, without touching TrackMacros", async () => {
  const { plugin, file, getFrontmatter } = makePlugin({
    macrosEnabled: false,
    frontmatter: { type: "Recipe", Portions: 2 },
    noteContent: RECIPE_BODY,
  });

  const result = await plugin.calculateRecipeMacros(file, { silent: true });

  assert.equal(result, null);
  assert.equal("TrackMacros" in getFrontmatter(), false);
});

test("calculateRecipeMacros leaves an already-true TrackMacros untouched (no redundant write)", async () => {
  const { plugin, file, getFrontmatter } = makePlugin({
    macrosEnabled: true,
    frontmatter: { type: "Recipe", Portions: 2, TrackMacros: true },
    noteContent: RECIPE_BODY,
  });

  await plugin.calculateRecipeMacros(file, { silent: true });
  assert.equal(getFrontmatter().TrackMacros, true);
});

test("calculateMacrosForAllRecipes logs findings to the console instead of creating a report note", async () => {
  const { plugin } = makePlugin({
    macrosEnabled: true,
    frontmatter: { type: "Recipe", Portions: 1, TrackMacros: true },
    noteContent: RECIPE_BODY,
  });
  // "chicken breast" resolves fine per-100g but has no gramsPerUnit entry —
  // measuring it by count ("unit") instead of weight triggers a real
  // finding, same shape as the user's original mandarin bug report.
  plugin.getRecipeIngredients = async () => [ing("chicken breast", "unit", 1)];
  // vault.create/vault.getAbstractFileByPath/workspace intentionally left
  // undefined — if calculateMacrosForAllRecipes tried to write or open a
  // report note, calling a missing method would throw and fail the test.

  const originalWarn = console.warn;
  const warnMessages = [];
  console.warn = (...args) => warnMessages.push(args.join(" "));
  try {
    await plugin.calculateMacrosForAllRecipes();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnMessages.length, 1);
  assert.match(warnMessages[0], /Macro Calculation Report/);
  assert.match(warnMessages[0], /No per-unit weight for "chicken breast"/);
});

test("calculateMacrosForAllRecipes stays silent on the console when there are no findings", async () => {
  const { plugin } = makePlugin({
    macrosEnabled: true,
    frontmatter: { type: "Recipe", Portions: 2, TrackMacros: true },
    noteContent: RECIPE_BODY,
  });

  const originalWarn = console.warn;
  let warnCalled = false;
  console.warn = () => { warnCalled = true; };
  try {
    await plugin.calculateMacrosForAllRecipes();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnCalled, false);
});
