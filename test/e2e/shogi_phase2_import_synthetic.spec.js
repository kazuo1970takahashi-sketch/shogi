// @ts-check
// SHOGI-TOUR-APPHQ-003D-4D-1 — synthetic-fixture-only Phase 2 import e2e.
// SHOGI-TOUR-APPHQ-003D-4F-1 — expected values made fixture-driven so no
// count / class distribution / fixed date literal is encoded in this
// spec. All numeric / structural expectations are derived from
// SYNTHETIC_FIXTURE at runtime (003D-4F design §5 / §8 案 B).
//
// This test uses ONLY synthetic fixture data. It is not derived from real
// data. It does NOT reference any real-data import asset and does NOT
// reuse any literal from the existing import spec.
//
// Scope (see docs/operations/shogi_tour_apphq_003d4d_synthetic_e2e_addition_design.md
// and docs/operations/shogi_tour_apphq_003d4f_validator_expected_values_separation_design.md):
//   - Confirms the synthetic fixture is parseable and synthetic-only.
//   - Confirms the convert step maps synthetic input to synthetic member
//     records via window.convertPhase2ParticipantsToMembers, asserting
//     count / class distribution / name set / city set are all derived
//     from the fixture itself (no operational literal is encoded).
//   - Confirms the applyPhase2Import code path executes against
//     synthetic input. The synthetic fixture is intentionally NOT shaped
//     to match the operational-data structural constraints baked into
//     the current validator (count / class breakdown / fixed date) —
//     validator constraint separation inside shogi_v4.html is tracked
//     under 003D-4F-2+ (案 A / C). While that separation is pending,
//     applyPhase2Import is expected to take a deterministic validation
//     branch and we only surface that fact via a boolean.
//
// This spec does not assert on operational-data counts, class
// distributions, or fixed dates. All assertions are relative to the
// synthetic fixture only. validator error strings are kept inside the
// page boundary (003D-4D-1-FIX1 Must Fix 2 / 003D-4F design §4).
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SYNTHETIC_FIXTURE_PATH = path.join(
  __dirname, '..', 'fixtures', 'import', 'participants_synthetic_minimal.json'
);
const SYNTHETIC_FIXTURE = JSON.parse(fs.readFileSync(SYNTHETIC_FIXTURE_PATH, 'utf-8'));

// Synthetic-only branch master seed. updated_at is intentionally a
// non-date synthetic marker so this spec does not encode any fixed
// datetime literal (per 003D-4D §7 / 003Z §3.1). normalizeBranchMaster
// in shogi_v4.html accepts any non-numeric updated_at and falls back
// safely; nothing in the import code path depends on this value being
// a real timestamp.
const EMPTY_MASTER = {
  schema_version: 1,
  updated_at: 'synthetic_updated_at',
  members: []
};

// Synthetic naming regime guards. These regexes describe the synthetic
// invariants of the fixture (Fixture User NNN / Dummy City NNN /
// fixture_date_NNN) — they intentionally do not match real-data shapes.
const SYNTHETIC_NAME_RE = /^Fixture User \d{3}$/;
const SYNTHETIC_CITY_RE = /^Dummy City \d{3}$/;
const SYNTHETIC_LAST_PLAYED_RE = /^fixture_date_\d{3}$/;

// ----- fixture-derived expected values (003D-4F-1) -----
// Every cardinality / distribution / set used below is computed from
// SYNTHETIC_FIXTURE itself. The spec never compares against a fixed
// operational count, distribution, or date.
const EXPECTED_COUNT = SYNTHETIC_FIXTURE.length;
const EXPECTED_CLASS_COUNTS = SYNTHETIC_FIXTURE.reduce(function (acc, r) {
  var k = r && r.last_class != null ? String(r.last_class) : 'null';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, /** @type {Record<string, number>} */ ({}));
const EXPECTED_CLASS_KEYS = Object.keys(EXPECTED_CLASS_COUNTS).sort();
const EXPECTED_NAME_SET = SYNTHETIC_FIXTURE.map(function (r) { return r.name; }).sort();
const EXPECTED_CITY_SET = Array.from(
  new Set(SYNTHETIC_FIXTURE.map(function (r) { return r.city; }))
).sort();

async function setup(page, master) {
  await page.addInitScript((data) => {
    try {
      localStorage.clear();
      if (data) localStorage.setItem('shogi_branch_master', JSON.stringify(data));
    } catch (e) {}
  }, master || null);
  await page.goto('/shogi_v4.html');
}

test.describe('Phase 2 import — synthetic fixture only (003D-4D-1 / 003D-4F-1)', () => {
  test('synthetic fixture is parseable and contains only synthetic values', () => {
    expect(Array.isArray(SYNTHETIC_FIXTURE)).toBe(true);
    expect(EXPECTED_COUNT).toBeGreaterThan(0);
    for (const r of SYNTHETIC_FIXTURE) {
      expect(typeof r.name).toBe('string');
      expect(r.name).toMatch(SYNTHETIC_NAME_RE);
      expect(typeof r.city).toBe('string');
      expect(r.city).toMatch(SYNTHETIC_CITY_RE);
      expect(r.last_class === 'A' || r.last_class === 'B').toBe(true);
      expect(typeof r.last_played).toBe('string');
      expect(r.last_played).toMatch(SYNTHETIC_LAST_PLAYED_RE);
    }
    // Fixture-derived class keys must be a subset of the synthetic
    // class regime {A, B} — this is a synthetic invariant of the
    // fixture, NOT an operational distribution claim.
    for (const k of EXPECTED_CLASS_KEYS) {
      expect(k === 'A' || k === 'B').toBe(true);
    }
  });

  test('convertPhase2ParticipantsToMembers maps synthetic input to synthetic members', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.convertPhase2ParticipantsToMembers(data, master);
      const members = (result && result.members) ? result.members : [];
      /** @type {Record<string, number>} */
      const classCounts = {};
      for (const m of members) {
        const k = m && m.last_class != null ? String(m.last_class) : 'null';
        classCounts[k] = (classCounts[k] || 0) + 1;
      }
      return {
        success: Boolean(result && result.success === true),
        memberCount: members.length,
        names: members.map((m) => m.name).sort(),
        cities: Array.from(new Set(members.map((m) => m.city))).sort(),
        classCounts: classCounts,
        allHaveId: members.every((m) => typeof m.id === 'string' && m.id.length > 0),
        allNamesSynthetic: members.every((m) => /^Fixture User \d{3}$/.test(m.name)),
        allCitiesSynthetic: members.every((m) => /^Dummy City \d{3}$/.test(m.city)),
      };
    }, SYNTHETIC_FIXTURE);

    expect(r.success).toBe(true);
    // All numeric / set checks below are derived from the fixture — no
    // operational count, distribution, or date is encoded.
    expect(r.memberCount).toBe(EXPECTED_COUNT);
    expect(r.names).toEqual(EXPECTED_NAME_SET);
    expect(r.cities).toEqual(EXPECTED_CITY_SET);
    expect(r.classCounts).toEqual(EXPECTED_CLASS_COUNTS);
    expect(r.allHaveId).toBe(true);
    expect(r.allNamesSynthetic).toBe(true);
    expect(r.allCitiesSynthetic).toBe(true);
  });

  test('applyPhase2Import code path executes against synthetic input', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      // We deliberately do NOT surface result.error / result.errors[] /
      // result.summary to the test process. validator error strings may
      // contain operational constants; keeping them inside the page
      // boundary avoids leaking them into Playwright traces / failure
      // messages / artifacts (003D-4D-1-FIX1 Must Fix 2).
      const newMembers = (result && result.newMaster && Array.isArray(result.newMaster.members))
        ? result.newMaster.members
        : null;
      /** @type {Record<string, number> | null} */
      let classCounts = null;
      if (newMembers) {
        classCounts = {};
        for (const m of newMembers) {
          const k = m && m.last_class != null ? String(m.last_class) : 'null';
          classCounts[k] = (classCounts[k] || 0) + 1;
        }
      }
      return {
        success: Boolean(result && result.success === true),
        hasError: Boolean(result && result.error),
        newMemberCount: newMembers ? newMembers.length : null,
        newNames: newMembers ? newMembers.map((m) => m.name).sort() : null,
        newCities: newMembers ? Array.from(new Set(newMembers.map((m) => m.city))).sort() : null,
        newClassCounts: classCounts,
        allNewNamesSynthetic: newMembers
          ? newMembers.every((m) => /^Fixture User \d{3}$/.test(m.name))
          : null,
        allNewCitiesSynthetic: newMembers
          ? newMembers.every((m) => /^Dummy City \d{3}$/.test(m.city))
          : null,
      };
    }, SYNTHETIC_FIXTURE);

    // Both outcomes confirm the import code path executed on synthetic data:
    //   - success === true: validator constraints already separated
    //     (post 003D-4F-2+). Synthetic input passes end-to-end. In that
    //     case every assertion is fixture-driven (count, class
    //     distribution, name set, city set) — no operational literal is
    //     encoded.
    //   - success === false with hasError === true: the call took a
    //     deterministic branch (e.g. validation) without throwing. This
    //     is the expected pre-separation outcome under 003D-4F-1 (案 B).
    expect(typeof r.success).toBe('boolean');
    if (r.success === true) {
      expect(r.newMemberCount).toBe(EXPECTED_COUNT);
      expect(r.newNames).toEqual(EXPECTED_NAME_SET);
      expect(r.newCities).toEqual(EXPECTED_CITY_SET);
      expect(r.newClassCounts).toEqual(EXPECTED_CLASS_COUNTS);
      expect(r.allNewNamesSynthetic).toBe(true);
      expect(r.allNewCitiesSynthetic).toBe(true);
    } else {
      expect(r.hasError).toBe(true);
    }
  });
});
