const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("extractYouTubeCaptionTracksFromHtml reads caption tracks from page html", () => {
  const html = `
    <script>
      var ytInitialPlayerResponse = {
        "captions": {
          "playerCaptionsTracklistRenderer": {
            "captionTracks": [
              {
                "baseUrl": "https://www.youtube.com/api/timedtext?lang=en\\u0026v=abc123",
                "languageCode": "en",
                "name": { "simpleText": "English" }
              }
            ]
          }
        }
      };
    </script>
  `;

  const tracks = ctx.extractYouTubeCaptionTracksFromHtml(html);

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].languageCode, "en");
  assert.match(tracks[0].baseUrl, /lang=en/);
  assert.match(tracks[0].baseUrl, /&v=abc123/);
});

test("fetchYouTubeTranscriptFromHtml prefers manual captions and parses json3 transcript text", async () => {
  const plugin = new PluginClass();
  const html = `
    <script>
      var ytInitialPlayerResponse = {
        "captions": {
          "playerCaptionsTracklistRenderer": {
            "captionTracks": [
              {
                "baseUrl": "https://www.youtube.com/api/timedtext?lang=en\\u0026kind=asr\\u0026v=abc123",
                "languageCode": "en",
                "kind": "asr",
                "name": { "simpleText": "English (auto-generated)" }
              },
              {
                "baseUrl": "https://www.youtube.com/api/timedtext?lang=en\\u0026v=abc123",
                "languageCode": "en",
                "name": { "simpleText": "English" }
              }
            ]
          }
        }
      };
    </script>
  `;

  let requestedUrl = "";
  const transcript = await plugin.fetchYouTubeTranscriptFromHtml(html, async ({ url }) => {
    requestedUrl = url;
    return {
      text: JSON.stringify({
        events: [
          { segs: [{ utf8: "Blend the almonds with water." }] },
          { segs: [{ utf8: "Strain the almond milk." }] },
        ],
      }),
    };
  });

  assert.match(requestedUrl, /fmt=json3/);
  assert.doesNotMatch(requestedUrl, /kind=asr/);
  assert.equal(transcript, "Blend the almonds with water.\nStrain the almond milk.");
});

test("buildUrlTranscriptionContext prioritizes transcript text when present", () => {
  const plugin = new PluginClass();

  const context = plugin.buildUrlTranscriptionContext({
    url: "https://www.youtube.com/watch?v=o878Cu5cRuU",
    rawHtml: "<main><h1>Recipe page</h1><p>Page fallback text.</p></main>",
    transcriptText: "Make the almond milk first.\nThen use it in the curry.",
    descriptionText: "In the video we share:\n*Recipe One",
  });

  assert.match(context, /^URL: https:\/\/www\.youtube\.com\/watch\?v=o878Cu5cRuU/);
  assert.match(context, /Source type: YouTube video/);
  assert.match(context, /Description:\nIn the video we share:\n\*Recipe One/);
  assert.match(context, /Transcript:\nMake the almond milk first\./);
  assert.doesNotMatch(context, /Page text:/);
  assert.doesNotMatch(context, /Recipe page Page fallback text\./);
});

test("buildUrlTranscriptionContext keeps page text for non-youtube urls", () => {
  const plugin = new PluginClass();

  const context = plugin.buildUrlTranscriptionContext({
    url: "https://example.com/recipe",
    rawHtml: "<main><h1>Recipe page</h1><p>Page fallback text.</p></main>",
    transcriptText: "",
  });

  assert.match(context, /Source type: Web page/);
  assert.match(context, /Content:\nRecipe page Page fallback text\./);
});

test("extractContextSection preserves transcript line boundaries", () => {
  const section = ctx.extractContextSection([
    "URL: https://www.youtube.com/watch?v=o878Cu5cRuU",
    "",
    "Transcript:",
    "first way coconut milk",
    "second way cashews",
    "",
    "Description:",
    "desc line",
  ].join("\n"), "Transcript");

  assert.equal(section, "first way coconut milk\nsecond way cashews");
});

test("extractRecipeTargetsFromDescription reads bullet recipe list from youtube description", () => {
  const targets = ctx.extractRecipeTargetsFromDescription([
    "No matter what you have on hand.",
    "",
    "Make sure to check out the website for a 5th, basic vegan hot chocolate that is not shown in the video.",
    "",
    "In the video we share:",
    "*Vegan Coconut Milk Hot Chocolate",
    "*Vegan Cashew Hot Chocolate",
    "*Vegan Maple Cinnamon Brown Sugar Hot Chocolate",
    "*Vegan Neapolitan Hot Chocolate",
    "",
    "Plus for the basic, coconut, and cashew, try these flavor recommendations in the post:",
  ].join("\n"));

  assert.deepEqual(
    Array.from(targets, (target) => target.title),
    [
      "Vegan Coconut Milk Hot Chocolate",
      "Vegan Cashew Hot Chocolate",
      "Vegan Maple Cinnamon Brown Sugar Hot Chocolate",
      "Vegan Neapolitan Hot Chocolate",
    ]
  );
});
