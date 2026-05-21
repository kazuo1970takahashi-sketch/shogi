// @ts-check
// SHOGI-TOUR-APPHQ-003D-4D-1 — synthetic-fixture-only Phase 2 import e2e.
//
// This test uses ONLY synthetic fixture data. It is not derived from real
// data. It does NOT reference data/import/20260412_participants.json and
// does NOT reuse any literal from the existing import spec.
//
// Scope (see docs/operations/shogi_tour_apphq_003d4d_synthetic_e2e_addition_design.md):
//   - Confirms the synthetic fixture is parseable and synthetic-only.
//   - Confirms the convert step maps synthetic input to synthetic member
//     records via window.convertPhase2ParticipantsToMembers.
//   - Confirms the applyPhase2Import code path executes against synthetic
//     input. The synthetic fixture is intentionally NOT shaped to match
//     the operational-data structural constraints baked into the current
//     validator (count / class breakdown / fixed date) — validator
//     constraint separation is tracked under 003D-4F / 003D-4F-1.
//
// This spec does not assert on operational-data counts, class
// distributions, or fixed dates. Assertions are relative to the
// synthetic fixture only.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const SYNTHETIC_FIXTURE_PATH = path.join(
  __dirname, '..', 'fixtures', 'import', 'participants_synthetic_minimal.json'
);
const SYNTHETIC_FIXTURE = JSON.parse(fs.readFileSync(SYNTHETIC_FIXTURE_PATH, 'utf-8'));

const EMPTY_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-08T00:00:00.000Z',
  members: []
};

const SYNTHETIC_NAME_RE = /^Fixture User \d{3}$/;
const SYNTHETIC_CITY_RE = /^Dummy City \d{3}$/;

async function setup(page, master) {
  await page.addInitScript((data) => {
    try {
      localStorage.clear();
      if (data) localStorage.setItem('shogi_branch_master', JSON.stringify(data));
    } catch (e) {}
  }, master || null);
  await page.goto('/shogi_v4.html');
}

test.describe('Phase 2 import — synthetic fixture only (003D-4D-1)', () => {
  test('synthetic fixture is parseable and contains only synthetic values', () => {
    expect(Array.isArray(SYNTHETIC_FIXTURE)).toBe(true);
    expect(SYNTHETIC_FIXTURE.length).toBeGreaterThan(0);
    for (const r of SYNTHETIC_FIXTURE) {
      expect(typeof r.name).toBe('string');
      expect(r.name).toMatch(SYNTHETIC_NAME_RE);
      expect(typeof r.city).toBe('string');
      expect(r.city).toMatch(SYNTHETIC_CITY_RE);
      expect(r.last_class === 'A' || r.last_class === 'B').toBe(true);
    }
  });

  test('convertPhase2ParticipantsToMembers maps synthetic input to synthetic members', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.convertPhase2ParticipantsToMembers(data, master);
      return {
        success: result.success,
        memberCount: result.members ? result.members.length : 0,
        firstName: result.members && result.members[0] ? result.members[0].name : null,
        firstCity: result.members && result.members[0] ? result.members[0].city : null,
        allNamesSynthetic: result.members
          ? result.members.every((m) => /^Fixture User \d{3}$/.test(m.name))
          : false,
        allCitiesSynthetic: result.members
          ? result.members.every((m) => /^Dummy City \d{3}$/.test(m.city))
          : false,
        allHaveId: result.members
          ? result.members.every((m) => typeof m.id === 'string' && m.id.length > 0)
          : false,
      };
    }, SYNTHETIC_FIXTURE);

    expect(r.success).toBe(true);
    expect(r.memberCount).toBe(SYNTHETIC_FIXTURE.length);
    expect(r.firstName).toMatch(SYNTHETIC_NAME_RE);
    expect(r.firstCity).toMatch(SYNTHETIC_CITY_RE);
    expect(r.allNamesSynthetic).toBe(true);
    expect(r.allCitiesSynthetic).toBe(true);
    expect(r.allHaveId).toBe(true);
  });

  test('applyPhase2Import code path executes against synthetic input', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      // Return only success / error / liveCount. We do NOT surface the
      // validator's error messages here, to keep validator-internal
      // operational-data constants out of test artifacts.
      return {
        success: result.success,
        errorType: result.error || null,
        liveCount: typeof result.liveCount === 'number' ? result.liveCount : null,
      };
    }, SYNTHETIC_FIXTURE);

    // Both outcomes confirm the import code path executed on synthetic data:
    //   - success === true: validator constraints already separated
    //     (post 003D-4F-1). Synthetic input passes end-to-end.
    //   - success === false with a non-empty error string: the call took a
    //     deterministic branch (e.g. validation) without throwing. This is
    //     the expected pre-separation outcome.
    expect(typeof r.success).toBe('boolean');
    if (r.success === false) {
      expect(typeof r.errorType).toBe('string');
      expect(r.errorType && r.errorType.length).toBeGreaterThan(0);
    }
  });
});
