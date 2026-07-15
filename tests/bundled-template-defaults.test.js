const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

// Trailing whitespace is not meaningful in either template (YAML null values
// and empty list markers), so the drift check compares right-trimmed lines.
function normalizeLines(text) {
  return String(text)
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
}

function readTemplateFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const RECIPE_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md";
const CANVAS_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas";

test("embedded recipe template matches templates/recipe-template.md", () => {
  const embedded = ctx.getBundledTemplateDefault(RECIPE_TEMPLATE_PATH);
  assert.ok(embedded, "expected an embedded recipe template default");
  assert.equal(normalizeLines(embedded), normalizeLines(readTemplateFile("templates/recipe-template.md")));
});

test("embedded meal-prep canvas template matches templates/meal-prep-canvas-template.canvas", () => {
  const embedded = ctx.getBundledTemplateDefault(CANVAS_TEMPLATE_PATH);
  assert.ok(embedded, "expected an embedded canvas template default");
  assert.equal(normalizeLines(embedded), normalizeLines(readTemplateFile("templates/meal-prep-canvas-template.canvas")));

  const parsed = JSON.parse(embedded);
  const labels = parsed.nodes.map((node) => node.label);
  for (const required of ["Projects", "Hosting", "Breakfast", "Lunch", "Dinner"]) {
    assert.ok(labels.includes(required), `canvas template missing group: ${required}`);
  }
});

test("getBundledTemplateDefault returns null for unknown paths", () => {
  assert.equal(ctx.getBundledTemplateDefault("some/other/file.md"), null);
  assert.equal(ctx.getBundledTemplateDefault(""), null);
});
