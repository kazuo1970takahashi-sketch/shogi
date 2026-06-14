// @ts-check
// SHOGI-TOUR-APPHQ-003H-2-D — members 形式 参加者候補マスタ読込 e2e（実ブラウザ）。
//
// このテストは完全架空の fixture（test/fixtures/import/branch_master_candidate_synthetic.json）
// のみを使う。実データ・実名・実マスタは一切参照しない。期待値はすべて fixture から
// 実行時に導出し、運用上の固定値（人数・クラス分布・固定日付）は埋め込まない。
//
// 実ブラウザでしか確認できない点に絞って検証する:
//   1. members 形式を上書きインポート → 候補マスタ(shogi_branch_master)へ実 localStorage 保存。
//   2. 大会state(shogi_v4)は不変（pairings/results/round/started 非変更・当日参加者 非自動登録）。
//   3. ページ再読込（=翌日 URL を開く相当）後も候補マスタが残る。
//   4. deleted=true は候補(findMemberCandidates)に出ない。
//   5. 禁止項目は保存 JSON に混入しない。
//
// validator / エラー文字列はページ境界内に留め、Playwright トレースへ出さない
// （既存 synthetic spec と同じ方針）。

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'import', 'branch_master_candidate_synthetic.json');
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

// fixture 由来の期待値（運用固定値を埋め込まない）
const EXPECTED_TOTAL = FIXTURE.members.length;
const EXPECTED_LIVE = FIXTURE.members.filter((m) => !m.deleted).length;
const SYNTHETIC_NAME_RE = /^架空 /;

// 進行中の大会データ（架空）。インポートで一切変更されないことの参照スナップショット。
const TOURNAMENT_STATE = {
  rounds: 4,
  started: true,
  players: { A: [{ id: 'p1', name: '架空 既存', cls: 'A', member: 'member', grade: 'ippan', entry_no: 1 }], B: [] },
  pairings: { A: [{ p1: 'p1', p2: 'p1', winner: null, lastModifiedBy: 'auto' }], B: [] },
  results: { A: [[]], B: [] },
  classes: [{ id: 'A', label: 'A級' }, { id: 'B', label: 'B級' }]
};

async function setup(page, seedState) {
  // addInitScript は reload でも毎回走るため、初回（shogi_v4 未seed時）のみ clear+seed する。
  //   再読込時は既存 localStorage（候補マスタ含む）を保持する＝「翌日 URL を開く」検証のため。
  await page.addInitScript((data) => {
    try {
      if (!localStorage.getItem('shogi_v4')) {
        localStorage.clear();
        // 候補マスタは空の状態から始める（初回端末相当）
        if (data && data.state) localStorage.setItem('shogi_v4', JSON.stringify(data.state));
      }
    } catch (e) {}
  }, { state: seedState });
  await page.goto('/shogi_v4.html');
}

test.describe('members 形式 参加者候補マスタ読込（003H-2-D / 実ブラウザ）', () => {
  test('上書きインポートで候補マスタへ保存・大会state不変・再読込後も残る', async ({ page }) => {
    await setup(page, TOURNAMENT_STATE);

    // 取込前: 候補マスタ空 / 大会state スナップショット取得
    const pre = await page.evaluate(() => ({
      master: window.loadBranchMaster().members.length,
      stateRaw: localStorage.getItem('shogi_v4')
    }));
    expect(pre.master).toBe(0);

    // 上書きインポート（UI handler が confirm 後に行う処理と同一: applyOverwriteImport → saveBranchMaster）
    const imp = await page.evaluate((fixture) => {
      const res = window.applyOverwriteImport(fixture);
      if (res && res.success) window.saveBranchMaster(res.newMaster);
      return {
        success: Boolean(res && res.success === true),
        // 保存後の候補マスタ件数（再 load）
        masterCount: window.loadBranchMaster().members.length,
        // 大会state は触っていないか（byte 比較用に raw 取得）
        stateRaw: localStorage.getItem('shogi_v4'),
        branchSaved: localStorage.getItem('shogi_branch_master') !== null
      };
    }, FIXTURE);

    expect(imp.success).toBe(true);
    expect(imp.branchSaved).toBe(true);
    expect(imp.masterCount).toBe(EXPECTED_TOTAL);
    // 大会state(shogi_v4)は完全に不変 = pairings/results/round/started 非変更・当日参加者 非自動登録
    expect(imp.stateRaw).toBe(pre.stateRaw);

    // ページ再読込（=翌日 URL を開く相当）
    await page.reload();

    const after = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const live = master.members.filter((m) => !m.deleted);
      // member boolean → status 変換の確認（fixture の member true/false に対応）
      const byId = {};
      for (const m of master.members) byId[m.id] = m;
      return {
        total: master.members.length,
        live: live.length,
        names: master.members.map((m) => m.name),
        // 大会state は再読込後も不変
        stateRaw: localStorage.getItem('shogi_v4'),
        // 保存 JSON 全文（禁止項目混入チェック用）
        branchRaw: localStorage.getItem('shogi_branch_master'),
        memberStatuses: master.members.map((m) => ({ id: m.id, member: m.member }))
      };
    });

    // 再読込後も候補マスタが残る（永続）
    expect(after.total).toBe(EXPECTED_TOTAL);
    expect(after.live).toBe(EXPECTED_LIVE);
    // 大会state は再読込後も不変
    expect(after.stateRaw).toBe(pre.stateRaw);
    // すべて架空命名（実データ風の固定値が混ざらない）
    for (const n of after.names) expect(n).toMatch(SYNTHETIC_NAME_RE);
    // 禁止項目の値・キーが保存 JSON に残らない
    expect(after.branchRaw.includes('example.invalid')).toBe(false);
    expect(after.branchRaw.includes('paymentHistory')).toBe(false);
    expect(after.branchRaw.includes('生年月日')).toBe(false);
  });

  test('deleted=true は候補(findMemberCandidates)に出ない / 生存 member は出る', async ({ page }) => {
    await setup(page, TOURNAMENT_STATE);

    const r = await page.evaluate((fixture) => {
      const res = window.applyOverwriteImport(fixture);
      window.saveBranchMaster(res.newMaster);
      const master = window.loadBranchMaster();
      // fixture から deleted / 生存の代表名を導出（固定値を埋め込まない）
      const deletedNames = fixture.members.filter((m) => m.deleted).map((m) => m.name);
      const liveNames = fixture.members.filter((m) => !m.deleted).map((m) => m.name);
      const deletedHits = deletedNames.map((nm) => window.findMemberCandidates({ name: nm }, master).length);
      const liveHits = liveNames.map((nm) => window.findMemberCandidates({ name: nm }, master).length);
      return { deletedHits, liveHits };
    }, FIXTURE);

    // deleted member はどの名前でも候補 0 件
    for (const n of r.deletedHits) expect(n).toBe(0);
    // 生存 member は候補に出る（>=1）
    for (const n of r.liveHits) expect(n).toBeGreaterThanOrEqual(1);
  });
});
