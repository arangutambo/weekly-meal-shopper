const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("image folder transcription saves every recipe returned for a single image", async () => {
  const plugin = new PluginClass();
  const saved = [];

  plugin.settings = {
    transcriptionImageFolder: "Utility/Recipe Image Inbox",
    deleteTranscribedImages: false,
  };
  plugin.app = {
    vault: {
      getFiles: () => [
        {
          path: "Utility/Recipe Image Inbox/page-1.png",
          basename: "page-1",
          extension: "png",
        },
      ],
      adapter: {
        readBinary: async () => Uint8Array.from([1, 2, 3]),
      },
    },
  };

  plugin.getImageMimeType = () => "image/png";
  plugin.transcribeWithOpenAI = async () => ([
    { title: "Recipe A", ingredients: ["1 egg"], directions: ["Cook egg"], notes: [] },
    { title: "Recipe B", ingredients: ["1 tomato"], directions: ["Slice tomato"], notes: [] },
  ]);
  plugin.saveTranscribedRecipeNote = async (recipe, options) => {
    saved.push({ recipe, options });
    return { path: `pages/${recipe.title}.md` };
  };

  await plugin.transcribeRecipesFromImageFolder();

  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((entry) => entry.recipe.title), ["Recipe A", "Recipe B"]);
  assert.equal(
    JSON.stringify(saved.map((entry) => entry.options)),
    JSON.stringify([
      { openFile: false, useOpenAIStandardization: true, showReview: true },
      { openFile: false, useOpenAIStandardization: true, showReview: true },
    ])
  );
});
