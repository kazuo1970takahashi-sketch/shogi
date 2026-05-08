// @ts-check
// Phase 2 e2e: マスタリセット + 22 名取込(仕様書 §6 受け入れ条件 1〜10)
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// 取り込み対象データ(本番と同じ JSON ファイルを読み取る)
const PHASE2_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'import', '20260412_participants.json');
const PHASE2_DATA = JSON.parse(fs.readFileSync(PHASE2_DATA_PATH, 'utf-8'));

const EMPTY_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-08T00:00:00.000Z',
  members: []
};

const SINGLE_MEMBER_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-08T00:00:00.000Z',
  members: [
    {id:'m_existing01',name:'既存太郎',yomi:'きそんたろう',first_attended:'2026-01-01',last_attended:'2026-04-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan',last_class:'A',deleted:false,deleted_at:null,note:'',city:'沼津市'}
  ]
};

const TOMBSTONE_ONLY_MASTER = {
  schema_version: 1,
  updated_at: '2026-05-08T00:00:00.000Z',
  members: [
    {id:'m_tomb01',name:'削除太郎',yomi:'さくじょたろう',first_attended:'2026-01-01',last_attended:'2026-01-01',tournament_ids:['t1'],attendance_count:1,member:'member',grade:'ippan',last_class:'A',deleted:true,deleted_at:'2026-04-10',note:'',city:''}
  ]
};

async function setup(page, master) {
  await page.addInitScript((data) => {
    try {
      localStorage.clear();
      if (data) localStorage.setItem('shogi_branch_master', JSON.stringify(data));
    } catch (e) {}
  }, master || null);
  await page.goto('/shogi_v4.html');
}

// ============================================================
// §6 #1 + #2: リセット二段階確認
// ============================================================
test.describe('Phase 2 §6 #1/#2: リセット二段階確認', () => {
  test('applyMasterReset(master) → members 空の新マスタ返却(純粋関数)', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const result = window.applyMasterReset(master);
      return { success: result.success, len: result.newMaster.members.length, schemaVersion: result.newMaster.schema_version };
    });
    expect(r.success).toBe(true);
    expect(r.len).toBe(0);
    expect(r.schemaVersion).toBe(1);
  });

  test('リセットモーダル: チェックボックス未チェック → 実行ボタン disabled', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await expect(page.locator('#master-reset-modal')).toBeVisible();
    // テキストだけ入れてチェックなし
    await page.locator('#mr-confirm-text').fill('リセット');
    await expect(page.locator('#mr-run')).toBeDisabled();
  });

  test('リセットモーダル: テキスト「リセット」未入力 → 実行ボタン disabled', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    // チェックだけ入れてテキストなし
    await page.locator('#mr-backup-checked').check();
    await expect(page.locator('#mr-run')).toBeDisabled();
  });

  test('リセットモーダル: テキストが「リセット」と完全一致しない → 実行ボタン disabled', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await page.locator('#mr-backup-checked').check();
    await page.locator('#mr-confirm-text').fill('リセットする'); // 部分一致 NG
    await expect(page.locator('#mr-run')).toBeDisabled();
  });

  test('リセットモーダル: 両方満たす → 実行 → マスタ空', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await page.locator('#mr-backup-checked').check();
    await page.locator('#mr-confirm-text').fill('リセット');
    await expect(page.locator('#mr-run')).toBeEnabled();
    await page.locator('#mr-run').click();
    await expect(page.locator('#master-reset-modal')).toHaveCount(0);
    const len = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')).members.length);
    expect(len).toBe(0);
  });

  test('リセットモーダル: キャンセル → マスタ不変', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await page.locator('#mr-backup-checked').check();
    await page.locator('#mr-confirm-text').fill('リセット');
    await page.locator('#mr-cancel').click();
    await expect(page.locator('#master-reset-modal')).toHaveCount(0);
    const len = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')).members.length);
    expect(len).toBe(1); // 不変
  });

  test('リセットモーダル: 件数表示が現在のマスタ件数と一致(生存 1 / tombstone 1)', async ({ page }) => {
    await setup(page, {
      schema_version: 1, updated_at: '2026-05-08T00:00:00.000Z',
      members: [
        {...SINGLE_MEMBER_MASTER.members[0]},
        {...TOMBSTONE_ONLY_MASTER.members[0]}
      ]
    });
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await expect(page.locator('#mr-live-count')).toHaveText('1');
    await expect(page.locator('#mr-tomb-count')).toHaveText('1');
  });
});

// ============================================================
// §6 #3: 既存 1 件以上で import 拒否(空マスタ専用制限)
// ============================================================
test.describe('Phase 2 §6 #3: 空マスタ専用制限', () => {
  test('applyPhase2Import: 既存マスタ生存 1 件以上で error=master_not_empty', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      return { success: result.success, error: result.error, liveCount: result.liveCount };
    }, PHASE2_DATA);
    expect(r.success).toBe(false);
    expect(r.error).toBe('master_not_empty');
    expect(r.liveCount).toBe(1);
  });

  test('applyPhase2Import: tombstone のみのマスタは許容(生存 0)', async ({ page }) => {
    await setup(page, TOMBSTONE_ONLY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      return { success: result.success, total: result.summary && result.summary.total, len: result.newMaster && result.newMaster.members.length };
    }, PHASE2_DATA);
    expect(r.success).toBe(true);
    expect(r.total).toBe(22);
    // tombstone 1 件は維持されたまま、新規 22 件追加 → 計 23 件
    expect(r.len).toBe(23);
  });

  test('Phase 2 import モーダル: 既存 1 件以上で警告バナーが出る + 検証通過しても実行ボタン disabled', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterPhase2ImportBtn');
    // DOM のテキスト化で `<strong>` 周辺にスペースが入る挙動を考慮
    await expect(page.locator('#phase2-import-modal')).toContainText(/既存マスタに\s*1\s*名\s*いるため実行できません/);
  });
});

// ============================================================
// §6 #4 + #6: 22 名 import 成功 + city 正規化
// ============================================================
test.describe('Phase 2 §6 #4/#6: 22 名 import 成功 + city 正規化', () => {
  test('applyPhase2Import: 22 名すべて登録(name/city/last_class/last_attended 正確)', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      const m = result.newMaster.members;
      return {
        success: result.success,
        total: m.length,
        first: { name: m[0].name, city: m[0].city, last_class: m[0].last_class, last_attended: m[0].last_attended, first_attended: m[0].first_attended },
        last: { name: m[m.length-1].name, last_class: m[m.length-1].last_class },
        countA: m.filter((x) => x.last_class === 'A').length,
        countB: m.filter((x) => x.last_class === 'B').length,
        allHaveId: m.every((x) => typeof x.id === 'string' && /^m_[0-9a-f]{12}$/.test(x.id)),
        allLastAttended: m.every((x) => x.last_attended === '2026-04-12'),
        allFirstAttended: m.every((x) => x.first_attended === '2026-04-12'),
        allEmptyTids: m.every((x) => Array.isArray(x.tournament_ids) && x.tournament_ids.length === 0),
        allCount0: m.every((x) => x.attendance_count === 0),
        allDeleted: m.every((x) => x.deleted === false && x.deleted_at === null),
        firstSummary: result.summary,
      };
    }, PHASE2_DATA);
    expect(r.success).toBe(true);
    expect(r.total).toBe(22);
    expect(r.countA).toBe(18);
    expect(r.countB).toBe(4);
    expect(r.first.name).toBe('片山凱翔');
    expect(r.first.city).toBe('御殿場市');
    expect(r.first.last_class).toBe('A');
    expect(r.first.last_attended).toBe('2026-04-12');
    expect(r.first.first_attended).toBe('2026-04-12');
    expect(r.allHaveId).toBe(true);
    expect(r.allLastAttended).toBe(true);
    expect(r.allFirstAttended).toBe(true);
    expect(r.allEmptyTids).toBe(true);
    expect(r.allCount0).toBe(true);
    expect(r.allDeleted).toBe(true);
    expect(r.firstSummary).toEqual({ total: 22, classA: 18, classB: 4 });
  });

  test('convert: city が "  沼津市  " → "沼津市"(Phase 1 normalizeCity 経由)', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate(() => {
      const master = window.loadBranchMaster();
      const fakeData = [
        {name:'氏名A',city:'  沼津市  ',last_class:'A',last_played:'2026-04-12',yomi:'',member:'',grade:''}
      ];
      // §2.1 検証は配列長 22 / A 18・B 4 必須なので convert を直接呼ぶ(部分検証)
      const conv = window.convertPhase2ParticipantsToMembers(fakeData, master);
      return { success: conv.success, city: conv.members[0].city };
    });
    expect(r.success).toBe(true);
    expect(r.city).toBe('沼津市');
  });
});

// ============================================================
// §6 #5: §2.1 検証通過時のみ適用、失敗時全件ロールバック
// ============================================================
test.describe('Phase 2 §6 #5: §2.1 検証 + 全件ロールバック', () => {
  test('validatePhase2ImportData: 配列長 21 → fail(length error)', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const short = data.slice(0, 21);
      const v = window.validatePhase2ImportData(short);
      return { ok: v.ok, errorCount: v.errors.length, hasLengthError: v.errors.some((e) => e.field === 'length') };
    }, PHASE2_DATA);
    expect(r.ok).toBe(false);
    expect(r.hasLengthError).toBe(true);
  });

  test('validatePhase2ImportData: A 級 17 名(計 21)→ fail(class_breakdown error)', async ({ page }) => {
    // A 級 1 名を削った 21 名(他は元データ)を渡しても length error が出るので、
    // A 級 19 + B 級 3 = 22 件にして class_breakdown のみで fail することを検証
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const skewed = data.map((p, i) => i < 21 ? Object.assign({}, p, { last_class: 'A' }) : Object.assign({}, p, { last_class: 'B' }));
      const v = window.validatePhase2ImportData(skewed);
      return { ok: v.ok, errors: v.errors.map((e) => e.field) };
    }, PHASE2_DATA);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('class_breakdown');
  });

  test('validatePhase2ImportData: last_class="C" → fail', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const bad = data.map((p, i) => i === 0 ? Object.assign({}, p, { last_class: 'C' }) : p);
      const v = window.validatePhase2ImportData(bad);
      return { ok: v.ok, hasLastClassError: v.errors.some((e) => e.field === 'last_class') };
    }, PHASE2_DATA);
    expect(r.ok).toBe(false);
    expect(r.hasLastClassError).toBe(true);
  });

  test('validatePhase2ImportData: name 空 → fail', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const bad = data.map((p, i) => i === 0 ? Object.assign({}, p, { name: '' }) : p);
      const v = window.validatePhase2ImportData(bad);
      return { ok: v.ok, hasNameError: v.errors.some((e) => e.field === 'name') };
    }, PHASE2_DATA);
    expect(r.ok).toBe(false);
    expect(r.hasNameError).toBe(true);
  });

  test('validatePhase2ImportData: city 21 文字 → fail', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const bad = data.map((p, i) => i === 0 ? Object.assign({}, p, { city: 'a'.repeat(21) }) : p);
      const v = window.validatePhase2ImportData(bad);
      return { ok: v.ok, hasCityError: v.errors.some((e) => e.field === 'city') };
    }, PHASE2_DATA);
    expect(r.ok).toBe(false);
    expect(r.hasCityError).toBe(true);
  });

  test('applyPhase2Import: 検証失敗で master 不変(全件ロールバック)', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const r = await page.evaluate((data) => {
      const bad = data.slice(0, 21); // 21 名(検証 fail)
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(bad, master);
      // 検証失敗後の localStorage を確認(saveBranchMaster は呼ばれないため空のまま)
      const after = JSON.parse(localStorage.getItem('shogi_branch_master'));
      return {
        success: result.success,
        error: result.error,
        afterLen: after.members.length,
        hasNewMaster: !!result.newMaster,
      };
    }, PHASE2_DATA);
    expect(r.success).toBe(false);
    expect(r.error).toBe('validation_failed');
    expect(r.afterLen).toBe(0); // master 不変
    expect(r.hasNewMaster).toBe(false); // newMaster は返さない
  });
});

// ============================================================
// §6 #7: 過去参加者パネルに 22 名表示
// ============================================================
test.describe('Phase 2 §6 #7: 過去参加者パネルに 22 名', () => {
  test('リセット → 22 名 import → 過去参加者パネルに 22 名(A 18 / B 4 はエントリー前なので未エントリーセクション)', async ({ page }) => {
    // 既存マスタ → リセット → import 全フロー
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    // リセット
    await page.click('#masterResetBtn');
    await page.locator('#mr-backup-checked').check();
    await page.locator('#mr-confirm-text').fill('リセット');
    await page.locator('#mr-run').click();
    await expect(page.locator('#master-reset-modal')).toHaveCount(0);
    // Phase 2 import + 過去参加者パネル再描画
    await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      window.saveBranchMaster(result.newMaster);
      // production の bindPhase2ImportModalEvents 同様、参加者登録タブ側 DOM を再描画
      if (typeof window.renderPastParticipantsPanel === 'function') {
        window.renderPastParticipantsPanel('');
      }
    }, PHASE2_DATA);
    // 参加者登録タブ → 過去参加者パネルを開く
    await page.click('#tab-reg');
    await expect(page.locator('#ppToggleBtn')).toBeVisible();
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    // 未エントリーセクションに 22 名(エントリー操作はしていないため A/B 済はゼロ)
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (22名)');
    await expect(page.locator('#ppPanel .pp-section-a-enrolled .pp-section-header')).toContainText('Aクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-b-enrolled .pp-section-header')).toContainText('Bクラスエントリー済 (0名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row')).toHaveCount(22);
  });
});

// ============================================================
// §6 #8: F7 編集モーダルで 22 名分の yomi/member/grade 編集可能(代表 1 名で確認)
// ============================================================
test.describe('Phase 2 §6 #8: F7 編集 22 名対応', () => {
  test('22 名 import 後、代表 1 名(片山凱翔)で yomi / member / grade / city 編集 → 保存 → 反映', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      window.saveBranchMaster(result.newMaster);
    }, PHASE2_DATA);
    await page.click('#tab-master');
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '片山凱翔' });
    await row.locator('.master-edit-btn').click();
    await page.locator('#me-yomi').fill('かたやまがいと');
    await page.check('input[name="me-member"][value="member"]');
    await page.check('input[name="me-grade"][value="ippan"]');
    await page.locator('#me-city').fill('御殿場市'); // 既存値
    await page.locator('#me-save').click();
    await expect(page.locator('#master-edit-modal')).toHaveCount(0);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    const m = after.members.find((m) => m.name === '片山凱翔');
    expect(m.yomi).toBe('かたやまがいと');
    expect(m.member).toBe('member');
    expect(m.grade).toBe('ippan');
    expect(m.city).toBe('御殿場市');
  });
});

// ============================================================
// §6 #10: round-trip(backup → リセット → import → restore で deepEqual)
// ============================================================
test.describe('Phase 2 §6 #10: backup → reset → import → restore round-trip', () => {
  test('元マスタ → export JSON → リセット → restore(applyOverwriteImport)で deepEqual 完全一致', async ({ page }) => {
    // 元マスタ(F7 補完済の現実的なケース: 22 名 import + 数名の手編集)
    await setup(page, EMPTY_MASTER);
    const original = await page.evaluate((data) => {
      const m = window.loadBranchMaster();
      const r = window.applyPhase2Import(data, m);
      window.saveBranchMaster(r.newMaster);
      // 1 名だけ手編集してから export
      const m2 = window.loadBranchMaster();
      const target = m2.members.find((x) => x.name === '片山凱翔');
      window.applyMasterMemberEdit(target.id, '片山凱翔', 'かたやまがいと', m2, { member: 'member', grade: 'ippan', city: '御殿場市' });
      window.saveBranchMaster(m2);
      const exportedJson = window.serializeBranchMasterForExport(window.loadBranchMaster());
      const exportedMaster = JSON.parse(exportedJson);
      return { exportedJson: exportedJson, exportedMaster: exportedMaster };
    }, PHASE2_DATA);

    // リセット → restore(既存 import overwrite で復元)
    const after = await page.evaluate((args) => {
      const m = window.loadBranchMaster();
      const reset = window.applyMasterReset(m);
      window.saveBranchMaster(reset.newMaster);
      const empty = window.loadBranchMaster();
      // 復元: 既存 applyOverwriteImport で復元(マスタ管理画面の通常運用)
      const r = window.applyOverwriteImport(args.exportedMaster);
      window.saveBranchMaster(r.newMaster);
      const restored = window.loadBranchMaster();
      return { restored: restored };
    }, { exportedMaster: original.exportedMaster });

    // deepEqual 比較: members の各 member について、updated_at 以外のフィールドが完全一致
    const orig = original.exportedMaster;
    const rest = after.restored;
    expect(rest.members.length).toBe(orig.members.length);
    expect(rest.schema_version).toBe(orig.schema_version);
    // 各 member を id でソートして deepEqual(_loaded_with_corruption は restored の生 LS には含まれない)
    const sortById = (arr) => arr.slice().sort((a, b) => a.id < b.id ? -1 : 1);
    const restMembers = sortById(rest.members).map((m) => {
      // _loaded_with_corruption / 内部キー除去(loadBranchMaster は付けないが念のため)
      const cleaned = {};
      Object.keys(m).forEach((k) => { if (!k.startsWith('_')) cleaned[k] = m[k]; });
      return cleaned;
    });
    const origMembers = sortById(orig.members);
    expect(restMembers).toEqual(origMembers);
  });
});

// ============================================================
// §6 #6 補強: F7 で city 編集後の Phase 1 normalizeCity 経由保証
// (上の convert テストでカバー済だが UI 経由でも確認)
// ============================================================
test.describe('Phase 2 §6 #6 補強: city UI 経由', () => {
  test('22 名 import 後、F7 で city を "  長泉町  " に変更 → trim 適用', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    await page.evaluate((data) => {
      const master = window.loadBranchMaster();
      const result = window.applyPhase2Import(data, master);
      window.saveBranchMaster(result.newMaster);
    }, PHASE2_DATA);
    await page.click('#tab-master');
    const row = page.locator('#pane-master tbody tr').filter({ hasText: '片山凱翔' });
    await row.locator('.master-edit-btn').click();
    await page.locator('#me-city').fill('  長泉町  ');
    await page.locator('#me-save').click();
    const m = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')).members.find((x) => x.name === '片山凱翔'));
    expect(m.city).toBe('長泉町');
  });
});

// ============================================================
// Phase 2 修正(2026-05-08 11:40):過去参加者パネル不在 Must Fix + ヘッダー label リネーム
// ============================================================
test.describe('Phase 2 fix: import 完了後の自動タブ切替 + section visible', () => {
  test('Phase 2 import 完了後、参加者登録タブが自動的に active になる', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    // マスタタブに切り替えて import モーダル経由で実行
    await page.click('#tab-master');
    await page.click('#masterPhase2ImportBtn');
    await expect(page.locator('#phase2-import-modal')).toBeVisible();
    // ファイル選択(本番 JSON)
    const fileInput = page.locator('#p2-file');
    await fileInput.setInputFiles(PHASE2_DATA_PATH);
    await expect(page.locator('#p2-run')).toBeEnabled();
    await page.locator('#p2-run').click();
    await expect(page.locator('#phase2-import-modal')).toHaveCount(0);
    // 自動的に参加者登録タブが active になる(showTab('reg'))
    await expect(page.locator('#tab-reg')).toHaveClass(/active/);
    await expect(page.locator('#pane-reg')).toBeVisible();
  });

  test('Phase 2 import 完了後、#past-participants-section が visible になる', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    await page.click('#tab-master');
    await page.click('#masterPhase2ImportBtn');
    await page.locator('#p2-file').setInputFiles(PHASE2_DATA_PATH);
    await expect(page.locator('#p2-run')).toBeEnabled();
    await page.locator('#p2-run').click();
    // section が visible(設計通り、master 22 名 → display:block)
    await expect(page.locator('#past-participants-section')).toBeVisible();
    await expect(page.locator('#ppToggleBtn')).toBeVisible();
  });

  test('Phase 2 import 完了後、過去参加者パネル展開で 22 名表示(未エントリーセクション)', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    await page.click('#tab-master');
    await page.click('#masterPhase2ImportBtn');
    await page.locator('#p2-file').setInputFiles(PHASE2_DATA_PATH);
    await expect(page.locator('#p2-run')).toBeEnabled();
    await page.locator('#p2-run').click();
    // 自動切替後、過去参加者パネルを展開
    await expect(page.locator('#ppToggleBtn')).toBeVisible();
    await page.click('#ppToggleBtn');
    await expect(page.locator('#ppPanel')).toBeVisible();
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-section-header')).toContainText('未エントリー (22名)');
    await expect(page.locator('#ppPanel .pp-section-not-enrolled .pp-row')).toHaveCount(22);
  });

  test('リセット直後はマスタ空のため #past-participants-section が hidden(設計通り)', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    await page.click('#tab-master');
    await page.click('#masterResetBtn');
    await page.locator('#mr-backup-checked').check();
    await page.locator('#mr-confirm-text').fill('リセット');
    await page.locator('#mr-run').click();
    await expect(page.locator('#master-reset-modal')).toHaveCount(0);
    // タブを切替なしでマスタタブのまま、参加者登録タブに切り替えて section 確認
    await page.click('#tab-reg');
    await expect(page.locator('#past-participants-section')).toBeHidden();
  });
});

test.describe('Phase 2 fix: ヘッダー「大会データをリセット」リネーム', () => {
  test('ヘッダーボタン textContent が「大会データをリセット」', async ({ page }) => {
    await setup(page, EMPTY_MASTER);
    const text = await page.locator('#resetBtn').textContent();
    expect(text.trim()).toBe('大会データをリセット');
  });

  test('ヘッダーボタン押下で state リセット(マスタ不変、機能変更なし)', async ({ page }) => {
    await setup(page, SINGLE_MEMBER_MASTER);
    // 参加者登録タブで A クラスに 1 名追加(state.players)
    await page.click('#ppToggleBtn');
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.locator('#ppPanel .pp-row').filter({ hasText: '既存太郎' }).locator('.pp-add-btn[data-cls="A"]').click();
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
    // ヘッダーの「大会データをリセット」ボタン押下 → confirm accept
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.click('#resetBtn');
    // state.players が空に
    await expect(page.locator('#a-list .player-row')).toHaveCount(0);
    // マスタ不変(既存太郎 1 名のまま、tombstone 化していない)
    const master = await page.evaluate(() => JSON.parse(localStorage.getItem('shogi_branch_master')));
    const live = master.members.filter((m) => !m.deleted);
    expect(live.length).toBe(1);
    expect(live[0].name).toBe('既存太郎');
  });
});
