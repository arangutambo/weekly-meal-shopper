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
