// @ts-check
// §3.4 / §4.3: shogi 固有 primary assertion カタログ(P0 19 操作 → 22 factory)。
// v1.4: #20 stateLoadedFromFile に beforeClick(dialog auto-accept) + afterClick(waitForFunction) を内蔵。

const { expect } = require('@playwright/test');
const { stableStringify, expectStateChanged } = require('./stableStringify');

/**
 * @typedef {Object} ExpectedChangeFactory
 *   `clickAndExpectChange` / `triggerInputFileAndExpectChange` に渡す factory の戻り値型。
 *   両ヘルパ共通(v1.3 以降)。
 *
 * @property {(before: Object, after: Object, page: import('@playwright/test').Page) => Promise<void>} assertion
 * @property {{
 *   operation: string,
 *   primaryAssertions: number,
 *   primaryTypes: string[],
 *   description: string,
 *   requiredPermissions?: string[]
 * }} meta
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [beforeClick]
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [afterClick]
 */

const shogiAssertions = {
  // #1 参加者追加
  participantAdded: (cls) => ({
    assertion: async (before, after, page) => {
      expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'participantAdded',
      description: `${cls}クラスに参加者が1名追加される`,
    },
  }),

  // #2/#3 クラス選択(過去参加者)
  classSelectedFromPast: (cls) => ({
    assertion: async (before, after, page) => {
      expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
      expect(after.state.players[cls].at(-1).cls).toBe(cls);
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state'],
      operation: 'classSelectedFromPast',
      description: `過去参加者から${cls}クラスに追加`,
    },
  }),

  // #4/#5 クラス選択(サジェスト)
  classSelectedFromSuggest: (cls, expectedMemberId) => ({
    assertion: async (before, after, page) => {
      expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
      expect(after.state.players[cls].at(-1).cls).toBe(cls);
      expect(after.state.players[cls].at(-1).member_id).toBe(expectedMemberId);
    },
    meta: {
      primaryAssertions: 3,
      primaryTypes: ['state'],
      operation: 'classSelectedFromSuggest',
      description: `サジェストから${cls}クラスに追加(member_id 一致)`,
    },
  }),

  // #6 対局開始(SF#1: A/B 両方の pairings 確認)
  tournamentStarted: () => ({
    assertion: async (before, after, page) => {
      expect(after.state.started).toBe(true);
      expect(after.activeTab).toBe('tab-tournament');
      if (before.state.players.A.length >= 2) {
        expect(after.state.pairings.A.length).toBeGreaterThan(0);
        expect(after.state.pairings.A.length * 2).toBe(before.state.players.A.length);
      }
      if (before.state.players.B.length >= 2) {
        expect(after.state.pairings.B.length).toBeGreaterThan(0);
        expect(after.state.pairings.B.length * 2).toBe(before.state.players.B.length);
      }
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state', 'tab'],
      operation: 'tournamentStarted',
      description: '対局開始(state.started + tab 遷移 + A/B pairings 生成)',
    },
  }),

  // #7/#8 勝者ボタン
  winnerSelected: (cls, matchIndex, position) => ({
    assertion: async (before, after, page) => {
      const expectedWinner = before.state.pairings[cls][matchIndex][position];
      expect(after.state.pairings[cls][matchIndex].winner).toBe(expectedWinner);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'winnerSelected',
      description: `${cls}クラス第${matchIndex}組の勝者を${position}に設定`,
    },
  }),

  // #9 ラウンド確定(SF#2: options.isFinal で次 pairings 不要、自動判定は Stage 2b)
  roundConfirmed: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length + 1);
      if (!options.isFinal) {
        expectStateChanged(before, after, `state.pairings.${cls}`);
      }
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'roundConfirmed',
      description: `${cls}クラスのラウンド確定(${options.isFinal ? '最終' : '中間'})`,
    },
  }),

  // #10 ペアリング再生成(SF#3: options.allowSameContent で内容変化任意)
  pairingsRegenerated: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length);
      expect(after.state.pairings[cls].length * 2).toBe(before.state.players[cls].length);
      if (!options.allowSameContent) {
        expectStateChanged(before, after, `state.pairings.${cls}`);
      }
    },
    meta: {
      primaryAssertions: options.allowSameContent ? 2 : 3,
      primaryTypes: ['state'],
      operation: 'pairingsRegenerated',
      description: `${cls}クラスの pairings 再生成${options.allowSameContent ? '(同内容許容)' : ''}`,
    },
  }),

  // #11 対戦相手変更保存
  opponentChanged: (cls, matchIndex) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, `state.pairings.${cls}.${matchIndex}`);
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length);
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state'],
      operation: 'opponentChanged',
      description: `${cls}クラス第${matchIndex}組の対戦相手変更`,
    },
  }),

  // #12 過去対局勝者変更
  pastWinnerChanged: (cls, round, matchIndex) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, `state.results.${cls}.${round}.${matchIndex}`);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'pastWinnerChanged',
      description: `${cls}クラス R${round} 第${matchIndex}組の勝者変更`,
    },
  }),

  // #13 名前一括編集保存
  bulkNamesEdited: (cls) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, `state.players.${cls}`);
      expect(after.state.players[cls].length).toBe(before.state.players[cls].length);
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state'],
      operation: 'bulkNamesEdited',
      description: `${cls}クラスの名前一括編集`,
    },
  }),

  // #14 マスタ追加
  masterMemberAdded: () => ({
    assertion: async (before, after, page) => {
      expect(after.master.members.length).toBe(before.master.members.length + 1);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state-master'],
      operation: 'masterMemberAdded',
      description: 'マスタに新メンバー追加',
    },
  }),

  // #15 マスタ編集
  masterMemberEdited: (targetId) => ({
    assertion: async (before, after, page) => {
      const beforeMember = before.master.members.find((m) => m.id === targetId);
      const afterMember = after.master.members.find((m) => m.id === targetId);
      expect(afterMember).toBeDefined();
      expect(stableStringify({ name: afterMember.name, yomi: afterMember.yomi })).not.toBe(
        stableStringify({ name: beforeMember.name, yomi: beforeMember.yomi })
      );
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state-master'],
      operation: 'masterMemberEdited',
      description: `マスタ member ${targetId} の name/yomi 編集`,
    },
  }),

  // #16 マスタ論理削除
  masterMemberDeleted: (targetId) => ({
    assertion: async (before, after, page) => {
      const member = after.master.members.find((m) => m.id === targetId);
      expect(member.deleted).toBe(true);
      expect(member.deleted_at).not.toBeNull();
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state-master'],
      operation: 'masterMemberDeleted',
      description: `マスタ member ${targetId} の論理削除`,
    },
  }),

  // #24 マスタ復元(Stage 2c PR-3 新設、L0 §1.5 P0 候補 — masterMemberDeleted の対称実装)
  // production(shogi_v4.html L800-808): restore 関数は target.deleted=false, target.deleted_at=null
  // primary: deleted フラグが false に変わる + deleted_at が null になる(再削除可能状態)
  masterMemberRestored: (targetId) => ({
    assertion: async (before, after, page) => {
      const beforeMember = before.master.members.find((m) => m.id === targetId);
      expect(beforeMember).toBeDefined();
      expect(beforeMember.deleted, 'restore 前は deleted=true が前提').toBe(true);
      const afterMember = after.master.members.find((m) => m.id === targetId);
      expect(afterMember).toBeDefined();
      expect(afterMember.deleted).toBe(false);
      expect(afterMember.deleted_at).toBeNull();
    },
    meta: {
      primaryAssertions: 2,
      primaryTypes: ['state-master'],
      operation: 'masterMemberRestored',
      description: `マスタ member ${targetId} の復元(deleted:false + deleted_at:null)`,
    },
  }),

  // #17 マスタインポート(SF#4: length 増加 / 既存不変 / tombstone OR / schema_version 維持)
  // §3.4 末尾: overwrite モード時の confirm + #mi-file の setInputFiles はテスト側責任(Stage 2b で factory 化)
  masterImported: (options = {}) => ({
    assertion: async (before, after, page) => {
      const { expectedNewCount = 0, existingMemberIds = [], tombstoneOrIds = [] } = options;
      expect(after.master.members.length).toBe(before.master.members.length + expectedNewCount);
      for (const id of existingMemberIds) {
        const beforeMember = before.master.members.find((m) => m.id === id);
        const afterMember = after.master.members.find((m) => m.id === id);
        expect(afterMember.name).toBe(beforeMember.name);
        expect(afterMember.yomi).toBe(beforeMember.yomi);
      }
      for (const id of tombstoneOrIds) {
        const member = after.master.members.find((m) => m.id === id);
        expect(member.deleted).toBe(true);
      }
      expect(after.master.schema_version).toBe(before.master.schema_version);
    },
    meta: {
      primaryAssertions: 4,
      primaryTypes: ['state-master'],
      operation: 'masterImported',
      description: 'マスタインポート(既存側優先 + tombstone OR + schema_version 維持)',
    },
  }),

  // #18 大会データコピー(clipboard primary、v1.2 で requiredPermissions 構造化)
  // 実体: saveData() は navigator.clipboard.writeText().then(() => alert(...)) の非同期。
  //   - beforeClick: alert を auto-accept
  //   - assertion: clipboard 書き込み完了を polling で待ってから検証
  tournamentDataCopied: () => ({
    beforeClick: async (page) => {
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
    },
    assertion: async (before, after, page) => {
      let text = '';
      for (let i = 0; i < 40; i++) {
        text = await page.evaluate(() => navigator.clipboard.readText());
        try {
          const p = JSON.parse(text);
          if (p && p.players) break;
        } catch (e) {
          // not yet written
        }
        await page.waitForTimeout(50);
      }
      const parsed = JSON.parse(text);
      // saveData() 内の syncBranchMasterOnSave() が新規 player に member_id を補完するため
      // (mutation あり)、保存後の state (= after.state) と clipboard の一致を検証する。
      // spec §4.3 の `before.state.players` 比較は実 production の mutation 事実と乖離。
      expect(parsed.players).toEqual(after.state.players);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['clipboard'],
      operation: 'tournamentDataCopied',
      description: '大会データをクリップボードにコピー',
      requiredPermissions: ['clipboard-read', 'clipboard-write'],
    },
  }),

  // #19 読み込み実行(貼付) - confirm + alert はテスト側で page.on('dialog') を仕込む(Stage 2a 責任)
  stateLoaded: (expectedPlayersA, expectedPlayersB) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, 'state');
      if (expectedPlayersA != null) expect(after.state.players.A.length).toBe(expectedPlayersA);
      if (expectedPlayersB != null) expect(after.state.players.B.length).toBe(expectedPlayersB);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateLoaded',
      description: '貼付 JSON で state を置換',
    },
  }),

  // #20 読み込み実行(ファイル) - v1.4 で実体接続反映(Codex v1.3 → v1.4 MF#1)
  // 使用ヘルパ: triggerInputFileAndExpectChange
  // 対象: #loadFile(隠し file input、L94)
  // 仲介 button(#load-pick-file)は使わない
  // 実体: loadData(e) は confirm('現在のデータを上書きして読み込みますか？')
  //        → FileReader.onload(非同期) → applyLoadedJson + alert('データを読み込みました') の 3 段
  stateLoadedFromFile: (expectedPlayersA, expectedPlayersB) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, 'state');
      if (expectedPlayersA != null) expect(after.state.players.A.length).toBe(expectedPlayersA);
      if (expectedPlayersB != null) expect(after.state.players.B.length).toBe(expectedPlayersB);
    },
    // v1.4: dialog auto-accept(confirm + alert を計 2 回受諾)
    beforeClick: async (page) => {
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
    },
    // v1.4: FileReader.onload 非同期完了 + state 反映を待つ
    afterClick: async (page) => {
      await page.waitForFunction(
        ([expA, expB]) => {
          if (!window.state) return false;
          if (expA != null && window.state.players.A.length !== expA) return false;
          if (expB != null && window.state.players.B.length !== expB) return false;
          return window.state.players.A.length > 0 || window.state.players.B.length > 0;
        },
        [expectedPlayersA, expectedPlayersB],
        { timeout: 2000 }
      );
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateLoadedFromFile',
      description:
        'ファイルから state を復元(triggerInputFileAndExpectChange で setInputFiles + dialog auto-accept + FileReader.onload 完了待ち)',
    },
  }),

  // #21 リセット(master 不変が重要) - confirm はテスト側で page.on('dialog') 仕込み(Stage 2a 責任)
  stateReset: () => ({
    assertion: async (before, after, page) => {
      expect(after.state.players.A.length).toBe(0);
      expect(after.state.players.B.length).toBe(0);
      expect(after.state.started).toBe(false);
      expect(after.localStorage.shogi_v4).toBeNull();
      expect(after.localStorage.shogi_branch_master).toBe(before.localStorage.shogi_branch_master);
    },
    meta: {
      primaryAssertions: 5,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateReset',
      description: 'state 初期化(master 温存)',
    },
  }),

  // #23 タブ切替(Stage 2c 新設、L0 §1.5 P1 操作 — `tournamentStarted` の汎用版)
  // production: showTab(t) が pane-{t} display + tab-{t} className を切替、state.activeTab は持たない
  // primary: getStateSnapshot.activeTab(`.tab.active` の id)が targetTab に一致
  // idempotent クリック(既に target タブで再クリック)も等価に成立(Stage 6 横スクロール検証で発生)
  tabSwitched: (targetTab) => ({
    assertion: async (before, after, page) => {
      expect(after.activeTab).toBe(targetTab);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['tab'],
      operation: 'tabSwitched',
      description: `タブ ${targetTab} に切替(after.activeTab === targetTab)`,
    },
  }),

  // #22 報告書ダウンロード(SF#1 統一、3 モード対応)
  reportDownloaded: (mode = 'window-print') => ({
    assertion: async (before, after, page) => {
      if (mode === 'window-print') {
        const printCalled = await page.evaluate(() => window.__printCalled === true);
        expect(printCalled).toBe(true);
      } else if (mode === 'pdf-blob') {
        const blobCreated = await page.evaluate(() => window.__blobCreated === true);
        expect(blobCreated).toBe(true);
      } else if (mode === 'anchor-download') {
        const downloadTriggered = await page.evaluate(() => window.__downloadTriggered === true);
        expect(downloadTriggered).toBe(true);
      } else {
        throw new Error(`reportDownloaded: unknown mode ${mode}`);
      }
    },
    beforeClick: async (page) => {
      if (mode === 'window-print') {
        await page.evaluate(() => {
          window.__printCalled = false;
          const orig = window.print;
          window.print = function () {
            window.__printCalled = true;
            return orig && orig.apply(this, arguments);
          };
        });
      } else if (mode === 'pdf-blob') {
        await page.evaluate(() => {
          window.__blobCreated = false;
          const orig = URL.createObjectURL;
          URL.createObjectURL = function (blob) {
            if (blob && blob.type && blob.type.includes('pdf')) window.__blobCreated = true;
            return orig.apply(this, arguments);
          };
        });
      } else if (mode === 'anchor-download') {
        await page.evaluate(() => {
          window.__downloadTriggered = false;
          document.addEventListener(
            'click',
            (e) => {
              if (e.target && e.target.tagName === 'A' && e.target.hasAttribute('download')) {
                window.__downloadTriggered = true;
              }
            },
            true
          );
        });
      }
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['spy'],
      operation: 'reportDownloaded',
      description: `報告書ダウンロード(${mode})`,
    },
  }),
};

module.exports = { shogiAssertions };
