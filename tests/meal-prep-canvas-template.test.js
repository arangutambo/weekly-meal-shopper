const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const PluginClass = ctx.module.exports;

test("buildMealPrepCanvasFilename uses ISO week and ISO year placeholders", () => {
  const plugin = new PluginClass();
  plugin.settings = {
    mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
  };

  const fileName = plugin.buildMealPrepCanvasFilename(new Date("2026-11-03T12:00:00"));
  assert.equal(fileName, "⛑️ Weekly Meal Plan Week 45 2026.canvas");
});

test("createWeeklyMealPrepCanvas copies the plugin canvas template into the target folder", async () => {
  const plugin = new PluginClass();
  const createdFiles = [];
  const opened = [];
  const templateContent = "{\n  \"nodes\": [\n    {\"id\": \"group-1\", \"type\": \"group\"}\n  ],\n  \"edges\": []\n}\n";

  plugin.settings = {
    mealPrepCanvasFolder: "Utility",
    mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
  };
  plugin.ensureFolderPathExists = async () => {};
  plugin.saveSettings = async () => {};
  plugin.buildMealPrepCanvasFilename = () => "⛑️ Weekly Meal Plan Week 45 2026.canvas";
  plugin.app = {
    vault: {
      getAbstractFileByPath: () => null,
      create: async (filePath, content) => {
        const created = { path: filePath, content };
        createdFiles.push(created);
        return created;
      },
      adapter: {
        exists: async (filePath) =>
          filePath === ".obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas",
        read: async () => templateContent,
      },
    },
    workspace: {
      getLeaf: () => ({
        openFile: async (file) => {
          opened.push(file.path);
        },
      }),
    },
  };

  const created = await plugin.createWeeklyMealPrepCanvas();

  assert.equal(created.path, "Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas");
  assert.equal(created.content, templateContent);
  assert.equal(plugin.settings.weeklyCanvasPath, "Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas");
  assert.deepEqual(opened, ["Utility/⛑️ Weekly Meal Plan Week 45 2026.canvas"]);
  assert.equal(createdFiles.length, 1);
});

test("bundled meal-prep canvas template keeps the scaffold but ships without recipe cards", () => {
  const templatePath = path.resolve(__dirname, "..", "templates", "meal-prep-canvas-template.canvas");
  const parsed = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

  assert.ok(nodes.length > 0);
  assert.ok(nodes.every((node) => node.type === "group"));
  assert.equal(nodes.some((node) => node.type === "file"), false);
});
