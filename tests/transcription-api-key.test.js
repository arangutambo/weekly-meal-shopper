const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("resolveTranscriptionApiKey falls back to persisted settings and strips a Bearer prefix", async () => {
  const plugin = new PluginClass();
  plugin.settings = {
    transcriptionApiKey: "",
    useStoredTranscriptionApiKey: true,
  };
  plugin.loadData = async () => ({
    openaiApiKey: "Bearer sk-test-123",
  });

  const key = await plugin.resolveTranscriptionApiKey();

  assert.equal(key, "sk-test-123");
});

test("resolveTranscriptionApiKey ignores persisted stored keys when the toggle is off", async () => {
  const plugin = new PluginClass();
  plugin.settings = {
    transcriptionApiKey: "",
    useStoredTranscriptionApiKey: false,
  };
  plugin.loadData = async () => ({
    openaiApiKey: "Bearer sk-test-123",
  });

  const key = await plugin.resolveTranscriptionApiKey();

  assert.equal(key, "");
});
