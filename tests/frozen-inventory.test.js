const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

test("clampFrozenPortionValue floors at zero and coerces junk to zero", () => {
  assert.equal(ctx.clampFrozenPortionValue(-3), 0);
  assert.equal(ctx.clampFrozenPortionValue(0), 0);
  assert.equal(ctx.clampFrozenPortionValue(2.5), 2.5);
  assert.equal(ctx.clampFrozenPortionValue("4"), 4);
  assert.equal(ctx.clampFrozenPortionValue("not a number"), 0);
  assert.equal(ctx.clampFrozenPortionValue(undefined), 0);
});

test("adjustFrozenPortionValue increments and decrements without going negative", () => {
  assert.equal(ctx.adjustFrozenPortionValue(2, 1), 3);
  assert.equal(ctx.adjustFrozenPortionValue(2, -1), 1);
  assert.equal(ctx.adjustFrozenPortionValue(1, -1), 0);
  assert.equal(ctx.adjustFrozenPortionValue(0, -1), 0);
  assert.equal(ctx.adjustFrozenPortionValue("3", -0.5), 2.5);
  assert.equal(ctx.adjustFrozenPortionValue(undefined, 1), 1);
});

test("frozenAgeInDays measures whole days and handles missing/bad dates", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  assert.equal(ctx.frozenAgeInDays("2026-06-05T12:00:00Z", now), 5);
  assert.equal(ctx.frozenAgeInDays("2026-06-10T00:00:00Z", now), 0);
  assert.equal(ctx.frozenAgeInDays("", now), null);
  assert.equal(ctx.frozenAgeInDays("not a date", now), null);
});

test("describeFrozenAge labels age and flags stale entries past the threshold", () => {
  const now = new Date("2026-06-10T12:00:00Z");

  const fresh = ctx.describeFrozenAge("2026-06-08T12:00:00Z", { now, staleDays: 90 });
  assert.equal(fresh.label, "frozen 2 days ago");
  assert.equal(fresh.isStale, false);

  const today = ctx.describeFrozenAge("2026-06-10T08:00:00Z", { now, staleDays: 90 });
  assert.equal(today.label, "frozen today");

  const stale = ctx.describeFrozenAge("2026-01-01T12:00:00Z", { now, staleDays: 90 });
  assert.equal(stale.isStale, true);

  const disabled = ctx.describeFrozenAge("2020-01-01T12:00:00Z", { now, staleDays: 0 });
  assert.equal(disabled.isStale, false);

  const missing = ctx.describeFrozenAge("", { now });
  assert.equal(missing.days, null);
  assert.equal(missing.isStale, false);
});
