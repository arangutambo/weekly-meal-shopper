const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

// Section objects returned by ctx.* functions live in the vm sandbox's realm,
// so their prototype differs from a plain `{}` literal written in this file
// even when the properties match — assert.deepEqual then reports a mismatch
// on [[Prototype]] rather than content. Compare fields directly instead.
function assertSection(actual, expected) {
  assert.equal(actual.type, expected.type);
  assert.equal(actual.person, expected.person);
}

test("classifySectionLabel recognizes 'Family: <name>' groups", () => {
  assertSection(ctx.classifySectionLabel("Family: Alice"), { type: "family", person: "Alice" });
  assertSection(ctx.classifySectionLabel("family:bob"), { type: "family", person: "bob" });
  assertSection(ctx.classifySectionLabel("  FAMILY :   Charlie  "), { type: "family", person: "Charlie" });
});

test("classifySectionLabel keeps recognizing project/hosting/default (regression guard on the return-shape change)", () => {
  assertSection(ctx.classifySectionLabel("Projects"), { type: "project" });
  assertSection(ctx.classifySectionLabel("Hosting"), { type: "hosting" });
  assertSection(ctx.classifySectionLabel("Breakfast"), { type: "default" });
  assertSection(ctx.classifySectionLabel(""), { type: "default" });
});

test("sectionForNode resolves a family group via the existing geometric containment logic", () => {
  const groups = [
    { label: "Family: Alice", x: 0, y: 0, width: 200, height: 200 },
    { label: "Hosting", x: 300, y: 0, width: 200, height: 200 },
  ];

  const nodeInAlice = { x: 50, y: 50, width: 20, height: 20 };
  const nodeInHosting = { x: 350, y: 50, width: 20, height: 20 };
  const nodeOutside = { x: 900, y: 900, width: 20, height: 20 };

  assertSection(ctx.sectionForNode(nodeInAlice, groups), { type: "family", person: "Alice" });
  assertSection(ctx.sectionForNode(nodeInHosting, groups), { type: "hosting" });
  assertSection(ctx.sectionForNode(nodeOutside, groups), { type: "default" });
});

test("parseCanvasRecipeEntries tags file nodes with the family section object", () => {
  const canvas = JSON.stringify({
    nodes: [
      { id: "g1", type: "group", label: "Family: Bob", x: 0, y: 0, width: 500, height: 500 },
      { id: "f1", type: "file", file: "Recipes/Stew.md", x: 50, y: 50, width: 100, height: 100 },
    ],
    edges: [],
  });

  const entries = ctx.parseCanvasRecipeEntries(canvas);
  assert.equal(entries.length, 1);
  assertSection(entries[0].section, { type: "family", person: "Bob" });
});
