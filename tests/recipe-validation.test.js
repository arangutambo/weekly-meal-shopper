const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const types = (findings) => findings.map((f) => f.type);

test("flags missing/invalid Portions frontmatter", () => {
  const missing = ctx.validateRecipeData({ ingredientLines: ["- 1 ; cup ; flour ;"], portions: null });
  assert.ok(types(missing).includes("portions"));

  const ok = ctx.validateRecipeData({ ingredientLines: ["- 1 ; cup ; flour ;"], portions: 4 });
  assert.ok(!types(ok).includes("portions"));
});

test("flags unparseable ingredient lines but ignores blank/separator rows", () => {
  const findings = ctx.validateRecipeData({
    // "; ; ;" is an empty placeholder row (ignored); "abc ; g ; flour ;" has a
    // non-numeric amount slot so the structured parser rejects it (flagged).
    ingredientLines: ["-  ;  ;  ; ", "- abc ; g ; flour ;", "- 200 ; g ; chickpeas ;"],
    portions: 2,
  });
  const unparsed = findings.filter((f) => f.type === "unparsed");
  assert.equal(unparsed.length, 1);
  assert.match(unparsed[0].message, /flour/);
});

test("flags ingredients that fall into the default 'Other' category", () => {
  const findings = ctx.validateRecipeData({
    ingredientLines: ["- 1 ; unit ; fictional zorpfruit ;"],
    portions: 2,
  });
  const uncategorized = findings.filter((f) => f.type === "uncategorized");
  assert.equal(uncategorized.length, 1);
  assert.match(uncategorized[0].message, /zorpfruit/);
});

test("a clean structured recipe with known ingredients yields no findings", () => {
  const findings = ctx.validateRecipeData({
    ingredientLines: ["- 200 ; g ; chickpeas ;", "- 1 ; unit ; brown onion ;"],
    portions: 4,
  });
  assert.equal(findings.length, 0);
});

test("counts legacy (non 4-slot) lines as an info finding", () => {
  const findings = ctx.validateRecipeData({
    ingredientLines: ["- 1 cup flour", "- 2 eggs"],
    portions: 4,
  });
  const legacy = findings.find((f) => f.type === "legacy-format");
  assert.ok(legacy, "expected a legacy-format finding");
  assert.match(legacy.message, /2 ingredient/);
});

test("report renders findings grouped by recipe; empty scan says no issues", () => {
  const empty = ctx.buildRecipeValidationReport([], 5);
  assert.match(empty, /No issues found/);
  assert.match(empty, /Scanned 5 recipe/);

  const report = ctx.buildRecipeValidationReport([
    { name: "Bean Stew", link: "[[Bean Stew]]", findings: [
      { severity: "info", type: "uncategorized", message: "\"zorpfruit\" has no category rule (lands in Other)." },
      { severity: "error", type: "unparsed", message: "Could not parse ingredient line: \"@@@@\"" },
    ] },
  ], 3);

  assert.match(report, /## \[\[Bean Stew\]\]/);
  // errors sort before info
  const errIdx = report.indexOf("Could not parse");
  const infoIdx = report.indexOf("zorpfruit");
  assert.ok(errIdx !== -1 && infoIdx !== -1 && errIdx < infoIdx);
});
