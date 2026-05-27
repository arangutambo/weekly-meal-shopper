const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("transcribeWithOpenAI can discover and transcribe multiple youtube recipes separately", async () => {
  const plugin = new PluginClass();
  plugin.settings = {
    transcriptionModel: "gpt-4.1-mini",
  };
  plugin.resolveTranscriptionApiKey = async () => "test-key";

  const capturedInputs = [];
  plugin.requestOpenAIResponsesWithRetry = async ({ input }) => {
    capturedInputs.push(input);
    const instruction = String(input?.[0]?.content?.[0]?.text || "");
    const targetRecipe = String(input?.[0]?.content?.[2]?.text || "");
    if (/Identify every distinct recipe explicitly taught/i.test(instruction)) {
      return {
        json: {
          output_text: JSON.stringify({
            recipes: [
              { title: "Tomato Pasta", evidence: "Tomato Pasta" },
              { title: "Green Salad", evidence: "Green Salad" },
            ],
          }),
        },
      };
    }
    if (/Target recipe: Tomato Pasta/.test(targetRecipe)) {
      return {
        json: {
          output_text: JSON.stringify({
            title: "Tomato Pasta",
            ingredients: ["200 g pasta", "1 tomato"],
            directions: ["Boil the pasta.", "Add the tomato."],
          }),
        },
      };
    }
    if (/Target recipe: Green Salad/.test(targetRecipe)) {
      return {
        json: {
          output_text: JSON.stringify({
            title: "Green Salad",
            ingredients: ["1 lettuce", "1 cucumber"],
            directions: ["Chop the lettuce.", "Add the cucumber."],
          }),
        },
      };
    }
    throw new Error(`Unexpected request: ${instruction}`);
  };

  const recipes = await plugin.transcribeWithOpenAI({
    sourceLabel: "https://www.youtube.com/watch?v=o878Cu5cRuU",
    textContext: "Transcript:\nTomato Pasta\nGreen Salad",
    allowMultipleRecipes: true,
  });

  assert.equal(recipes.length, 2);
  assert.equal(recipes[0].title, "Tomato Pasta");
  assert.equal(recipes[1].title, "Green Salad");
  assert.equal(capturedInputs.length, 3);
  assert.match(capturedInputs[0][0].content[0].text, /Identify every distinct recipe explicitly taught/i);
  assert.match(capturedInputs[1][0].content[2].text, /Target recipe: Tomato Pasta/);
  assert.match(capturedInputs[2][0].content[2].text, /Target recipe: Green Salad/);
});

test("transcribeWithOpenAI prefers explicit youtube description recipe list when present", async () => {
  const plugin = new PluginClass();
  plugin.settings = {
    transcriptionModel: "gpt-4.1-mini",
  };
  plugin.resolveTranscriptionApiKey = async () => "test-key";

  const capturedInputs = [];
  plugin.requestOpenAIResponsesWithRetry = async ({ input }) => {
    capturedInputs.push(input);
    const targetRecipe = String(input?.[0]?.content?.[2]?.text || "");
    if (/Target recipe: Vegan Coconut Milk Hot Chocolate/.test(targetRecipe)) {
      return {
        json: {
          output_text: JSON.stringify({
            title: "Vegan Coconut Milk Hot Chocolate",
            ingredients: ["1 cup coconut milk"],
            directions: ["Heat the coconut milk."],
          }),
        },
      };
    }
    if (/Target recipe: Vegan Cashew Hot Chocolate/.test(targetRecipe)) {
      return {
        json: {
          output_text: JSON.stringify({
            title: "Vegan Cashew Hot Chocolate",
            ingredients: ["1 cup cashew milk"],
            directions: ["Heat the cashew milk."],
          }),
        },
      };
    }
    throw new Error(`Unexpected request: ${targetRecipe}`);
  };

  const recipes = await plugin.transcribeWithOpenAI({
    sourceLabel: "https://www.youtube.com/watch?v=o878Cu5cRuU",
    textContext: [
      "URL: https://www.youtube.com/watch?v=o878Cu5cRuU",
      "",
      "Source type: YouTube video",
      "",
      "Source title: The BEST Vegan Hot Chocolate - 4 ways - Find the Best Way for you!",
      "",
      "Description:",
      "In the video we share:",
      "*Vegan Coconut Milk Hot Chocolate",
      "*Vegan Cashew Hot Chocolate",
      "",
      "Transcript:",
      "first way coconut milk",
    ].join("\n"),
    allowMultipleRecipes: true,
  });

  assert.equal(recipes.length, 2);
  assert.equal(recipes[0].title, "Vegan Coconut Milk Hot Chocolate");
  assert.equal(recipes[1].title, "Vegan Cashew Hot Chocolate");
  assert.equal(capturedInputs.length, 2);
  assert.match(capturedInputs[0][0].content[2].text, /Target recipe: Vegan Coconut Milk Hot Chocolate/);
  assert.match(capturedInputs[1][0].content[2].text, /Target recipe: Vegan Cashew Hot Chocolate/);
});

test("transcribeRecipeFromUrlEntry saves multiple notes when the input is marked as multi-recipe", async () => {
  const plugin = new PluginClass();
  plugin.settings = {
    recipeFolder: "pages/Imported Recipes",
  };

  plugin.promptTextEntry = async () => ({
    value: "https://www.youtube.com/watch?v=o878Cu5cRuU",
    checkboxValue: true,
  });

  let receivedOptions = null;
  plugin.transcribeWithOpenAI = async (options) => {
    receivedOptions = options;
    return [
      { title: "Recipe One", ingredients: ["1 egg"], directions: ["Cook the egg."] },
      {
        title: "Recipe Two",
        ingredients: ["2 eggs"],
        directions: ["Cook the eggs."],
        link: "https://makeitdairyfree.com/vegan-hot-chocolate/",
      },
      { title: "Recipe Three", ingredients: ["3 eggs"], directions: ["Bake the eggs."] },
      { title: "Recipe Four", ingredients: ["4 eggs"], directions: ["Serve the eggs."] },
    ];
  };

  const saves = [];
  plugin.saveTranscribedRecipeNote = async (recipe, options = {}) => {
    saves.push({ recipe, options });
    return { path: `pages/Imported Recipes/${recipe.title}.md` };
  };

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await plugin.transcribeRecipeFromUrlEntry();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(receivedOptions.allowMultipleRecipes, true);
  assert.equal(saves.length, 4);
  assert.equal(saves[0].options.openFile, false);
  assert.equal(saves[1].options.openFile, false);
  assert.equal(saves[2].options.openFile, false);
  assert.equal(saves[3].options.openFile, true);
  assert.equal(saves[1].recipe.link, "https://www.youtube.com/watch?v=o878Cu5cRuU");
});
