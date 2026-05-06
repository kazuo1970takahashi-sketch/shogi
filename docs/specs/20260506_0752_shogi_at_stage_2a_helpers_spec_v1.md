# Phase A-T Stage 2a 仕様書 v1.2:UI テストヘルパ実装(`expectClickable` + `clickAndExpectChange`)

**配置先**: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(同名上書き、v1.1 → v1.2)
**最終更新**: 2026-05-06 10:07 JST
**対象ブランチ**: `feat/phase-a-t-stage-2a-helpers`(main 1aa8e02 から派生、現 HEAD c86ef2d)
**準拠**: A-T spec v1.3、DevSecOps 運用方針 v1.2.5、L0 業務モデル文書 v1.1
**位置づけ**: A-T フェーズ Stage 2a の実装仕様書。Stage 2b/2c/4 の前提となるヘルパ基盤の設計を確定する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1 | 2026-05-06 07:52 | 初版起草。A-T spec v1.3 §0.2/§4/§5 + Stage 1 レポート §4.6 + L0 業務モデル文書 v1.1 §1.5 P0 を統合 | Claude.ai |
| v1.1 | 2026-05-06 08:05 | ChatGPT B+ レビュー反映: Must Fix 2 件(primary assertion 必須化を機械保証 + clipboard/print 系を扱える API 拡張)+ Should Fix 7 件 + Nice to Have 4 件すべて吸収。`clickAndExpectChange` API を factory 形式 + ctx 形式の併存に拡張、`options.beforeClick/afterClick` 追加、`shogi_assertions.js` の全 22 factory を `{assertion, meta, beforeClick?, afterClick?}` 構造に再設計 | Claude.ai |
| v1.2 | 2026-05-06 10:07 | ChatGPT v1.1 再レビュー A- 反映: Should Fix #1(raw callback 規律) / #2(roundConfirmed isFinal) / #3(allowSameContent 運用) / #6(P2→P0 統合の説明補足)+ Nice to Have #3(JSDoc typedef)+ 回帰懸念 3 件を吸収。Should Fix #2(`setupRequired` 構造化 → `requiredPermissions`)/ #3(grep 微調整の確定/実装時確認分離)も吸収。Should Fix #4(`isFinal` 自動判定)/ #5(`allowSameContent` 運用ルール)は §10 Stage 2b 申し送りに移管。任意の Nice to Have #1/#2/#4 は後段。 | Claude.ai |

---

## 1. 経緯と背景・スコープ

### 1.1 経緯

A-4.2(commit 73961d3)で A/B クラスボタンが実機では動作しないリグレッションが発生したが、e2e 124 件 / 単体 595 件のテストすべてを通過した。Stage 1 完了レポート(commit 3f38a13)で「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。

A-T spec v1.3 §4.2/§4.3 で `expectClickable` + `clickAndExpectChange` の 2 ヘルパが設計された。Stage 2a は**この 2 ヘルパの実装と shogi 固有 primary assertion カタログの整備**を担う。

### 1.2 スコープ

#### スコープ内(IN)

- `test/helpers/expectClickable.js` 実装(A-T spec v1.3 §4.2 + Nice to Have #2 小要素対応)
- `test/helpers/clickAndExpectChange.js` 実装(A-T spec v1.3 §4.3 + Must Fix #1/#2 解決の API 拡張)
- `test/helpers/getStateSnapshot.js` 実装(L0 §4.1 LocalStorage キー対応 + Nice to Have #1 DOM query option)
- `test/helpers/stableStringify.js` 実装(Nice to Have #3)
- `test/helpers/shogi_assertions.js` 実装(L0 §1.5 P0 19 操作 → 22 factory、v1.1 で factory 形式に再設計)
- 上記ヘルパの単体テスト(`test/helpers/*.test.js`)
- サンプル e2e テスト 1 ファイル(正常系 + 異常系の 3〜4 件、`primaryAssertions=0` で必ず赤 + clipboard 系 1 件)
- v1.1 既存 e2e(`test/e2e/*.spec.js` 124 件)への影響なし
- production code `shogi_v4.html` への変更なし(DevSecOps v1.2.5 §13 段階 1 自動マージ範囲)
- v1.2 で Should Fix #1〜#3, #6 + Nice to Have #3 + 回帰懸念 3 件への対策反映

#### スコープ外(OUT、Stage 2b 以降)

- 既存 e2e の置換(Stage 2b で実施、A-4.2 関連を優先)
- A-7 / A-8 等の新規 click 操作追加(各フェーズで `shogi_assertions.js` に追記)
- L0 §1.5 P1(モーダル開閉 11 操作)の DOM 表示変化 assertion 整備(Stage 2b)
- Codex L4 レビューの正式 YAML 化(Stage 2c で正式化、本仕様書では仮定義)
- `roundConfirmed` の `isFinal` 自動判定(Should Fix #4、§10 Stage 2b 申し送り)
- `pairingsRegenerated` の `allowSameContent` 運用ルール正式化(Should Fix #5、§10 Stage 2b 申し送り)

### 1.3 ユーザーストーリー

#### US-1: テスト作者が新しい click を書くとき

「私は新しい A-7 機能のテストを書く。`clickAndExpectChange(ボタン, shogiAssertions.someOperation())` と書きたい。書き忘れる primary assertion をヘルパが機械的に塞いでくれる。書き忘れたら必ず赤になる。」

#### US-2: ChatGPT メタレビューが本仕様書を読んだとき

「私は仕様書を読んで、機械保証されている assertion 規律と書き手の規律を区別したい。raw callback 形式の悪用余地が運用ルールでカバーされていることを確認したい(SF#1)。clipboard 系の `requiredPermissions` が文字列メモではなく構造化されていることを確認したい(SF#2)。」

#### US-3: Codex フェーズ境界レビューが Stage 2a を読んだとき

「私はカタログ網羅性、力学的検証、production code 不変、completion criteria 全項目を YAML で機械判定したい。完了判定 YAML は Stage 2c で正式化する前提で、今回は仮定義として用意されていればよい。raw callback の使用箇所と `requiredPermissions` 検証済み factory も観測対象に入れたい(v1.2 追加)。」

#### US-4: Stage 2b 担当が本ヘルパを使い始めたとき

「私は A-4.2 関連の既存 spec 7 件を `clickAndExpectChange` に置換する。`shogi_assertions.js` のカタログにある factory を引いて使う。clipboard / print / ファイル選択系も同じヘルパで書ける。`isFinal` / `allowSameContent` の運用ルールが §10 で示されているので、置換時の判断に迷わない(v1.2 追加)。」

---

## 2. 着手前条件(既達確認)

| 項目 | 状態 | 確認方法 |
|---|---|---|
| L0 業務モデル文書 v1.1 確定 | ✅ commit a5fda4a | `docs/specs/_business_model.md` |
| A-T spec v1.3 main マージ | ✅ commit 1aa8e02 | `docs/specs/20260506_0105_shogi_at_spec_v1_3.md` |
| Stage 1 完了レポート main マージ | ✅ commit 3f38a13 | `docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md` |
| 全テスト緑 | ✅ 単体 595 + e2e 124 = 719 件全 pass | CI / `npm test` |
| `force: true` 使用箇所ゼロ | ✅ Stage 1 で確認済み | `grep -nR 'force\s*:\s*true' test/` |
| ブランチ作成 | ✅ `feat/phase-a-t-stage-2a-helpers` | `git branch` |
| spec v1 commit | ✅ 76c38fa | `git log` |
| spec v1.1 ChatGPT 再レビュー依頼 commit | ✅ c86ef2d | `git log` |

---

## 3. 設計

### 3.1 `expectClickable` ヘルパ仕様(A-T spec v1.3 §4.2 + NH#2 小要素対応)

```javascript
// test/helpers/expectClickable.js
const { expect } = require('@playwright/test');

async function expectClickable(locator, options = {}) {
  // 段階 1: 物理的存在
  await expect(locator).toBeVisible({ timeout: 5000 });
  await expect(locator).toBeEnabled();

  // 段階 2: 表示状態(width/height > 0)
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  // 段階 3: 要素種別の検証(クリック可能要素であること)
  const handle = await locator.elementHandle();
  const tagName = await handle.evaluate(el => el.tagName.toLowerCase());
  const role = await handle.evaluate(el => el.getAttribute('role'));
  const isClickable =
    ['button', 'a', 'input'].includes(tagName) ||
    role === 'button' ||
    role === 'link' ||
    (await handle.evaluate(el => typeof el.onclick === 'function'));
  expect(isClickable, `要素 ${tagName} はクリック可能でない`).toBe(true);

  // 段階 4: 計算スタイル(pointer-events / opacity / visibility)
  const styles = await handle.evaluate(el => {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
    };
  });
  expect(styles.pointerEvents, 'pointer-events: none').not.toBe('none');
  expect(styles.opacity, 'opacity 0.5 未満は不可').toBeGreaterThanOrEqual(0.5);
  expect(styles.visibility, 'visibility: hidden').not.toBe('hidden');
  expect(styles.display, 'display: none').not.toBe('none');

  // 段階 5: 祖先要素の検証(display: none / inert / disabled)
  const ancestorOk = await handle.evaluate(el => {
    let cur = el.parentElement;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.display === 'none') return { ok: false, reason: 'ancestor display: none', tag: cur.tagName };
      if (cur.hasAttribute && cur.hasAttribute('inert')) return { ok: false, reason: 'ancestor inert', tag: cur.tagName };
      cur = cur.parentElement;
    }
    return { ok: true };
  });
  expect(ancestorOk.ok, `祖先 ${ancestorOk.tag || ''} で ${ancestorOk.reason || ''}`).toBe(true);

  // 段階 6: hit-test(中央点 + 角 4 点が要素自身または子孫であること、NH#2 小要素対応)
  const hitTestResult = await handle.evaluate(el => {
    const rect = el.getBoundingClientRect();
    // NH#2: 小要素(width<4 or height<4)では中央 1 点のみ評価
    const isSmall = rect.width < 4 || rect.height < 4;
    const inset = isSmall ? 0 : 2;
    const points = isSmall
      ? [[rect.x + rect.width / 2, rect.y + rect.height / 2]]
      : [
          [rect.x + rect.width / 2, rect.y + rect.height / 2],         // 中央
          [rect.x + inset, rect.y + inset],                            // 左上
          [rect.x + rect.width - inset, rect.y + inset],               // 右上
          [rect.x + inset, rect.y + rect.height - inset],              // 左下
          [rect.x + rect.width - inset, rect.y + rect.height - inset], // 右下
        ];
    for (const [x, y] of points) {
      const top = document.elementFromPoint(x, y);
      if (!top) return { ok: false, point: [x, y], reason: 'no element at point' };
      if (top !== el && !el.contains(top) && !top.contains(el)) {
        return {
          ok: false,
          point: [x, y],
          reason: `blocked by ${top.tagName}${top.id ? '#' + top.id : ''}`,
        };
      }
    }
    return { ok: true };
  });
  expect(hitTestResult.ok, `hit-test 失敗: ${hitTestResult.reason || ''}`).toBe(true);

  // 段階 7: focus 可能性(任意、a11y 用)
  if (options.requireFocusable) {
    await locator.focus();
    const isFocused = await handle.evaluate(el => document.activeElement === el);
    expect(isFocused, 'focus できない').toBe(true);
  }
}

module.exports = { expectClickable };
```

### 3.2 `clickAndExpectChange` ヘルパ仕様(v1.1 で API 拡張、Must Fix #1/#2 解決)

```javascript
// test/helpers/clickAndExpectChange.js
const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');

/**
 * @typedef {import('./shogi_assertions').ExpectedChangeFactory} ExpectedChangeFactory
 *   shogi_assertions.js で定義する factory 構造。詳細は §4.3 冒頭の typedef を参照。
 */

async function getStateSnapshot(page, options = {}) {
  const base = await page.evaluate(() => ({
    state: window.state ? JSON.parse(JSON.stringify(window.state)) : null,
    master: (() => {
      try {
        const raw = localStorage.getItem('shogi_branch_master');
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })(),
    localStorage: {
      shogi_v4: localStorage.getItem('shogi_v4'),
      shogi_v3: localStorage.getItem('shogi_v3'),
      shogi_branch_master: localStorage.getItem('shogi_branch_master'),
    },
    url: { pathname: location.pathname, hash: location.hash, search: location.search },
    activeTab: (() => {
      const t = document.querySelector('.tab.active');
      return t ? t.id : null;
    })(),
  }));

  // NH#1: DOM query snapshot(オプション)
  if (options.selectors) {
    base.dom = {};
    for (const [key, selector] of Object.entries(options.selectors)) {
      base.dom[key] = await page.locator(selector).isVisible();
    }
  }

  return base;
}

/**
 * クリック + 状態変化検証ヘルパ
 *
 * @param {import('@playwright/test').Locator} locator - クリック対象
 * @param {Function | ExpectedChangeFactory} expectedChange - 以下のいずれか:
 *   (a) factory 戻り値 { assertion, meta, beforeClick?, afterClick? }(推奨、§4.3 参照)
 *   (b) raw callback: async (before, after, ctx, page) => { ctx.primary('...'); ... }
 *       (raw callback はサンプル/例外用。P0 操作では原則 factory を使うこと。§3.2 末尾ガイドライン参照)
 * @param {Object} [options]
 * @param {Function} [options.beforeClick] - クリック前の追加 setup(spy 注入等)
 * @param {Function} [options.afterClick] - クリック後の追加 teardown
 * @param {Object} [options.snapshot] - getStateSnapshot に渡すオプション(NH#1)
 */
async function clickAndExpectChange(locator, expectedChange, options = {}) {
  await expectClickable(locator);
  const page = locator.page();

  // factory 戻り値の beforeClick + options.beforeClick を順に実行
  if (expectedChange && typeof expectedChange === 'object' && expectedChange.beforeClick) {
    await expectedChange.beforeClick(page);
  }
  if (options.beforeClick) {
    await options.beforeClick(page);
  }

  const before = await getStateSnapshot(page, options.snapshot || {});

  await locator.click();  // force: true 禁止

  if (expectedChange && typeof expectedChange === 'object' && expectedChange.afterClick) {
    await expectedChange.afterClick(page);
  }
  if (options.afterClick) {
    await options.afterClick(page);
  }

  const after = await getStateSnapshot(page, options.snapshot || {});

  // primary assertion 必須化(Must Fix #1 解決)
  let primaryCount = 0;

  if (typeof expectedChange === 'function') {
    // raw callback 形式: ctx.primary() 呼び出し回数で検証
    const ctx = {
      _primaryCount: 0,
      primary(description) {
        this._primaryCount += 1;
        return description;
      },
    };
    await expectedChange(before, after, ctx, page);
    primaryCount = ctx._primaryCount;
  } else if (expectedChange && typeof expectedChange === 'object' && typeof expectedChange.assertion === 'function') {
    // factory 戻り値形式: meta.primaryAssertions で検証
    await expectedChange.assertion(before, after, page);
    primaryCount = (expectedChange.meta && expectedChange.meta.primaryAssertions) || 0;
  } else {
    throw new Error(
      'clickAndExpectChange: expectedChange must be a function or factory result with { assertion, meta }'
    );
  }

  expect(
    primaryCount,
    `primary semantic assertion is required (>= 1), got ${primaryCount}. ` +
    `Use ctx.primary('description') in raw callback, or use a factory from shogi_assertions.js.`
  ).toBeGreaterThanOrEqual(1);
}

module.exports = { clickAndExpectChange, getStateSnapshot };
```

#### raw callback 形式の使用ガイドライン(v1.2 で追加、SF#1 反映)

raw callback 形式は柔軟だが、`ctx.primary('...')` を呼ぶだけで実 assertion 無しでも `primaryCount` が増えてしまう悪用余地がある(ChatGPT v1.1 再レビュー指摘)。

機械保証は「primary assertion の宣言回数 >= 1」までであり、「実際に業務状態を検証したこと」は完全には保証できない。したがって、書き手規律で補強する以下の運用ルールを必須とする:

- **L0 §1.5 P0 操作のテストは、原則として factory 形式を必須**(`shogi_assertions.js` のいずれかの factory を使う)
- raw callback 形式はサンプル/例外用途(factory 化されていない探索的テスト、helper 自身の単体テスト等)に限定
- raw callback を使う場合、`ctx.primary('description')` の呼び出し直後に対応する `expect(...)` を必ず書く(コメントだけ、または `await expect(...).toBeVisible()` のような通知確認だけは不可)
- Codex Yes YAML(§6 末尾)に `raw_callback_usage_count` を観測対象として追加(Stage 2c で閾値設定)

P0 操作の e2e テストで raw callback を使った場合、ChatGPT メタレビューおよび Codex 独立レビューで重点確認対象とする。

### 3.3 primary semantic assertion 必須化

`expectedChange` には以下のいずれかを **1 つ以上必須**で含める。**機械的に検証**(§3.2 末尾の `primaryCount` 検証):

| 種類 | 内容 | 適用例 |
|---|---|---|
| **状態変化** | `state` / `master` の差分 | `after.state.players.A.length === before.state.players.A.length + 1` |
| **DOM 変化** | 要素追加・削除・属性変化 | `after.dom.modalVisible !== before.dom.modalVisible` |
| **永続化変化** | localStorage / clipboard の差分 | `JSON.parse(after.localStorage.shogi_v4)` が新 state と一致 |
| **URL/タブ変化** | pathname / hash / activeTab の変化 | `before.activeTab !== after.activeTab` |
| **環境変化(spy 経由)** | window.print spy / Blob 生成 spy 等 | `await page.evaluate(() => window.__printCalled === true)` |

**禁止事項**(A-4.2 型悪用防止):
- L0 §1.5 P0 操作で **通知表示のみ** を成功条件とすることを禁止
- 例:`#saveBtn` で `expect(showMsg).toBeVisible()` だけ → 不可

**画面遷移系の例外**:画面遷移が業務目的そのものの場合、`activeTab` 変化を primary として単独で許容(補助 assertion として遷移先 DOM 表示確認を推奨)。

### 3.4 shogi 固有 primary assertion カタログ(L0 §1.5 P0 19 操作分、本仕様書の核心)

| # | 操作 | セレクタ | 業務目的 | factory 名 | primary 種類 | 注 |
|---|---|---|---|---|---|---|
| 1 | 参加者追加 | `#addBtn` | 受付フォームから参加者を 1 名登録 | `participantAdded(cls)` | state | - |
| 2 | クラス選択 A(過去参加者) | `.pp-add-btn[data-cls="A"]` | 過去参加者を A クラスに登録 | `classSelectedFromPast('A')` | state | - |
| 3 | クラス選択 B(過去参加者) | `.pp-add-btn[data-cls="B"]` | 過去参加者を B クラスに登録 | `classSelectedFromPast('B')` | state | - |
| 4 | クラス選択 A(サジェスト) | `.suggest-add-btn[data-cls="A"]` | サジェストから A クラスに登録 | `classSelectedFromSuggest('A', expectedMemberId)` | state | member_id 一致確認 |
| 5 | クラス選択 B(サジェスト) | `.suggest-add-btn[data-cls="B"]` | サジェストから B クラスに登録 | `classSelectedFromSuggest('B', expectedMemberId)` | state | 同上 |
| 6 | 対局開始 | `#startBtn` | 受付完了、トーナメント開始(タブ遷移を伴う業務目的) | `tournamentStarted()` | state + URL/タブ | **SF#1 反映:A/B 両方の pairings 確認** |
| 7 | 勝者ボタン p1 | `#wb_{cls}_{i}_p1` | 第 i 組の勝者を p1 に設定 | `winnerSelected(cls, matchIndex, 'p1')` | state | - |
| 8 | 勝者ボタン p2 | `#wb_{cls}_{i}_p2` | 第 i 組の勝者を p2 に設定 | `winnerSelected(cls, matchIndex, 'p2')` | state | - |
| 9 | ラウンド確定 | `#submitBtn_{cls}` | 現在ラウンドを確定し次ラウンドを生成 | `roundConfirmed(cls, options)` | state | **SF#2 反映:`options.isFinal=true` で次 pairings 不要**(v1.2: `isFinal` 自動判定は §10 Stage 2b 申し送り) |
| 10 | ペアリング再生成 | `#repairBtn_{cls}` | 現在ラウンドの pairings のみを再生成 | `pairingsRegenerated(cls, options)` | state | **SF#3 反映:`options.allowSameContent=true` で内容変化を任意化**(v1.2: 運用ルール正式化は §10 Stage 2b 申し送り) |
| 11 | 対戦相手変更保存 | `#chg-save` | 現在ラウンドの p1/p2 を変更 | `opponentChanged(cls, matchIndex)` | state | - |
| 12 | 過去対局勝者変更 | `#ep-p1` / `#ep-p2`(モーダル内) | 確定済みラウンドの勝者を変更 | `pastWinnerChanged(cls, round, matchIndex)` | state | - |
| 13 | 名前一括編集保存 | `#bulk-save` | 複数参加者の名前を一括変更 | `bulkNamesEdited(cls)` | state | - |
| 14 | マスタ追加 | `#me-save`(新規時、`data-mid` なし) | 過去参加者マスタに新メンバー追加 | `masterMemberAdded()` | state(master) | - |
| 15 | マスタ編集 | `#me-save`(既存、`data-mid` 付き) | 既存メンバーの name/yomi を変更 | `masterMemberEdited(targetId)` | state(master) | - |
| 16 | マスタ論理削除 | マスタ画面の削除ボタン | メンバーを tombstone 化 | `masterMemberDeleted(targetId)` | state(master) | `deleted_at` 必須 |
| 17 | マスタインポート実行 | `#mi-run` | 貼付 JSON をマスタにマージ | `masterImported(options)` | state(master) | **SF#4 反映:length 増加 / 既存不変 / tombstone OR / schema_version 維持を分離検証** |
| 18 | 大会データコピー | `#saveBtn` | state をクリップボードに JSON 退避 | `tournamentDataCopied()` | clipboard(spy) | **v1.2 反映:`meta.requiredPermissions = ['clipboard-read', 'clipboard-write']` 構造化**(v1.1 SF#5 の `setupRequired` 文字列を後継) |
| 19 | 読み込み実行(貼付) | `#load-from-paste` | 貼付 JSON で state を置換 | `stateLoaded(expectedPlayersA, expectedPlayersB)` | state + 永続化 | - |
| 20 | 読み込み実行(ファイル) | `#load-pick-file` 経由 | ファイルから state を復元 | `stateLoadedFromFile(filePath, expectedPlayersA, expectedPlayersB)` | state + 永続化 | `setInputFiles` を beforeClick で実施 |
| 21 | リセット | `#resetBtn` | state を初期化(master 温存) | `stateReset()` | state + 永続化 | - |
| 22 | 報告書ダウンロード | `#downloadReportBtn` | 月例運営報告書を出力 | `reportDownloaded(mode)` | spy(print/blob/anchor) | **SF#1 統一:mode = 'window-print' / 'pdf-blob' / 'anchor-download' を Stage 2a 実装着手時に grep で確定** |

**Stage 2a 実装着手時の追加 grep 確認**(SF#1〜#4 の最終確定):

```bash
# SF#1: 対局開始時の B クラス pairings 生成有無
grep -nE "generatePairing|state\.pairings\.B" shogi_v4.html

# SF#2: ラウンド確定時の最終ラウンド分岐
grep -nE "rounds\s*===|currentRound|state\.results.*length.*state\.rounds" shogi_v4.html

# SF#3: ペアリング再生成のシャッフルロジック
grep -nE "function generatePairing|repairBtn|shuffle" shogi_v4.html

# SF#4: マスタインポートの既存側優先 + tombstone OR ロジック
grep -nE "function (mergeMaster|importMaster)" shogi_v4.html

# SF#1 (報告書): printResults() の実装方式
sed -n '/function printResults/,/^function /p' shogi_v4.html | head -50
```

#### 確定仕様 vs 実装時確認の分離(v1.2 で追加、SF#3 反映)

ChatGPT v1.1 再レビューで「§3.4 末尾の grep 結果に応じて factory ロジックを微調整」が「v1.1 確定仕様としての固定度に揺れがある」と指摘された。v1.2 で以下のように分離する。

**確定仕様(v1.2 で固定、Stage 2a 実装着手後の変更不可)**:

- **factory 名**(全 22 個、§3.4 表「factory 名」列):`participantAdded`, `tournamentStarted` 等。改名や統合は不可
- **各 factory の責務**(§3.4 表「業務目的」列):業務目的の 1 文表現。範囲拡張・縮小は不可
- **primary assertion の種別**(§3.4 表「primary 種類」列):`state` / `state-master` / `clipboard` / `spy` / `state+localStorage` / `state+tab` 等。種別変更は不可
- **failure 条件**(§3.2 + §3.3):primary assertion が 1 件未満で必ず赤、`primaryAssertions=0` で赤

**実装時確認可(Stage 2a 実装着手時に上記 grep で確定)**:

- 実 selector(`#addBtn` 等の最終確認、命名揺れがあれば実体に合わせる)
- 実装関数名(`generatePairing` / `mergeMaster` / `printResults` の実体)
- mode 分岐の細部(`reportDownloaded(mode)` の 3 モードのうち実体に合致するもの)

**判定ルール**: primary assertion の責務が変わる(例: `tournamentStarted` の primary 種別が `state+tab` から `state` のみに縮小される、`reportDownloaded` の primary 種別が `spy` から `state` に変わる等)場合は v1.3 仕様書更新対象とする。grep 微調整では済まない。実装着手時に責務の変更が必要と判断された場合、Stage 2a 実装を一旦止めて Claude.ai に v1.3 起草を依頼する。

### 3.5 新規操作追加ルール(A-T spec v1.3 §4.3.8 から転記)

A-7 / A-8 / A-9 等で新規 click 操作を追加する場合:

1. **`shogi_assertions.js` に factory を追加**(カタログにない操作のテストを書くことを禁止)
2. **factory の `meta.operation` フィールドに業務目的を 1 文で記載**
3. **`meta.primaryAssertions >= 1` を保証**(state / DOM / 永続化 / URL / spy のいずれか)
4. **L0 §1.5 P0 に該当する場合、通知表示のみを成功条件にしない**
5. **既存カテゴリに当てはまらない場合、Stage 着手前に ChatGPT / Codex レビューへ回す**

判定責任:
- **業務目的整理**:Claude.ai(仕様書段階)
- **primary assertion の妥当性確認**:ChatGPT メタレビュー
- **factory 反映と実装**:Claude Code(Stage 着手時)
- **PR レビューでの抜け検出**:Codex(v1.2.5 §13.4 YAML)

### 3.6 P0/P1/P2 の Stage 適用範囲(SF #3 吸収、L0 §1.5 と接続)

L0 §1.5 で P0/P1/P2 に分類された 33 操作の Stage 別扱い:

| 優先度 | 操作数 | Stage 2a 扱い | Stage 2b 扱い | Stage 2c 扱い |
|---|---|---|---|---|
| P0(業務停止・データ破壊) | 19 操作(分割で 22 factory) | **カタログ完備必須**(§3.4)、clipboard/print/file 系も含む(v1.1 で API 拡張により対応) | A-4.2 関連を `clickAndExpectChange` で置換 | 残り P0 を全置換 |
| P1(表示状態・モーダル) | 11 操作 | factory 列挙のみ(後段の起点) | DOM 表示変化 assertion を原則必須で置換 | - |
| P2(印刷 / ファイル選択 / クリップボード) | 0 操作(v1.1 で P0 に統合) | - | - | - |

**v1.1 注**:v1 では P2 を Stage 2c 送りとしていたが、Must Fix #2 解決の API 拡張により P0 内に統合。L0 §1.5 P2 区分は「自動検証困難」という意味で残しつつ、Stage 2a 実装としては P0 と同列に扱う。

#### v1.2 補足(SF#6 反映、L0 §1.5 P2 概念との関係明文化)

ChatGPT v1.1 再レビューで「§3.6 では P2=0 操作になっている一方、L0 §1.5 P2 概念との関係が分かりにくい」と指摘された。本節は分類変更ではなく、Stage 2a 実装範囲上の統合であることを明文化する。

**業務優先度(L0 §1.5、変更なし)**:

- 印刷・ファイル選択・クリップボード操作は **業務優先度として P2** に分類されたまま
- これは「業務上の優先度(破壊性・業務停止リスク)」での分類
- L0 §1.5 の P2 区分は維持(v1.2 では L0 を変更しない)

**Stage 2a 検証実装範囲(本仕様書の取扱)**:

- v1.1 の API 拡張(`beforeClick/afterClick`、`requiredPermissions`、spy 注入)により、本来 P2 分類の操作も P0 と同列に factory 化して検証可能になった
- Stage 2a 実装範囲としては P0 カタログに統合(§3.4 #18 / #20 / #22)
- §3.6 表の「P2 = 0 操作」は Stage 2a 検証実装範囲上の統合を示すものであり、L0 業務優先度上の分類変更ではない

**結論**:

- L0 §1.5 P2 区分は維持(変更なし)
- Stage 2a 検証実装は P0 と同列に処理(API 拡張で対応可能となったため)
- 将来 L0 を更新する際、この統合方針が変わる場合は L0 を先に更新する(本仕様書を遡って更新する形ではなく)

### 3.7 stableStringify ヘルパ(NH#3)

`JSON.stringify` の順序差・不要差分による不安定化を避ける:

```javascript
// test/helpers/stableStringify.js

/**
 * オブジェクトをキー順に正規化して文字列化する。
 * 用途: state / master / localStorage 由来の JSON-compatible object の差分検証。
 *
 * 制限事項(v1.2 で明文化、Nice to Have #4 反映):
 * - 本 helper は state / master / localStorage 由来の JSON-compatible object 専用
 * - DOM node / Page / Locator / 循環参照オブジェクトには使用不可(無限ループまたは TypeError)
 * - Date / RegExp / Map / Set 等は JSON.stringify の既定挙動に従う(空オブジェクト等になる)
 */
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function expectStateChanged(before, after, path) {
  const get = (obj, p) => p.split('.').reduce((o, k) => o && o[k], obj);
  expect(stableStringify(get(after, path))).not.toBe(stableStringify(get(before, path)));
}

function expectStateUnchanged(before, after, path) {
  const get = (obj, p) => p.split('.').reduce((o, k) => o && o[k], obj);
  expect(stableStringify(get(after, path))).toBe(stableStringify(get(before, path)));
}

module.exports = { stableStringify, expectStateChanged, expectStateUnchanged };
```

---

## 4. 実装計画

### 4.1 ファイル配置

```
test/
  helpers/
    expectClickable.js              # 新規(§3.1)
    clickAndExpectChange.js         # 新規(§3.2、getStateSnapshot 同梱)
    stableStringify.js              # 新規(§3.7、NH#3)
    shogi_assertions.js             # 新規(§4.3、22 factory)
    expectClickable.test.js         # 新規(§5.1)
    clickAndExpectChange.test.js    # 新規(§5.1)
    stableStringify.test.js         # 新規(§5.1)
    shogi_assertions.test.js        # 新規(§5.1)
  e2e/
    sample/
      at_stage_2a_sanity.spec.js    # 新規(§5.2、サンプル e2e、v1.2 で clipboard 系 1 件追加)
```

### 4.2 命名規則

- factory 名は **camelCase**、業務目的を表す動詞句(`participantAdded`, `tournamentStarted`)
- ヘルパファイル名は **camelCase**(`expectClickable.js`)
- テストファイルは `<src>.test.js` または `<feature>.spec.js`

### 4.3 `shogi_assertions.js` の構造(v1.1 で factory 形式に再設計、v1.2 で typedef 追加)

```javascript
// test/helpers/shogi_assertions.js
const { expect } = require('@playwright/test');
const { expectStateChanged } = require('./stableStringify');

/**
 * @typedef {Object} ExpectedChangeFactory
 *   `clickAndExpectChange` に渡す factory の戻り値型。`clickAndExpectChange.js` 側でも参照する。
 *   v1.2 で NH#3 反映により JSDoc typedef 化。
 *
 * @property {(before: Object, after: Object, page: import('@playwright/test').Page) => Promise<void>} assertion
 *   状態変化を検証する assertion 関数。before/after は getStateSnapshot の戻り値、page は playwright Page。
 *
 * @property {{
 *   operation: string,
 *   primaryAssertions: number,
 *   primaryTypes: string[],
 *   description: string,
 *   requiredPermissions?: string[]
 * }} meta
 *   factory メタ情報。
 *   - operation: factory 名と一致する文字列(Codex 観測用)
 *   - primaryAssertions: assertion 内で実施する primary assertion の件数(>= 1 必須)
 *   - primaryTypes: §3.3 の primary 種別配列(`['state']`, `['state', 'tab']`, `['clipboard']` 等)
 *   - description: 業務目的の 1 文(§3.4 表「業務目的」列と整合)
 *   - requiredPermissions: clipboard 系等で必要な playwright context permission
 *     (v1.2 で SF#2 反映、文字列メモ `setupRequired` から構造化)
 *
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [beforeClick]
 *   クリック前 setup。spy 注入、ファイル選択ダイアログ、permission 関連の sanity check 等。
 *
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [afterClick]
 *   クリック後 teardown。
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

  // #6 対局開始(SF#1 反映:A/B 両方確認)
  tournamentStarted: () => ({
    assertion: async (before, after, page) => {
      expect(after.state.started).toBe(true);
      expect(after.activeTab).toBe('tab-tournament');
      // SF#1: A/B 両方の pairings 生成を確認(両クラスとも 2 名以上の場合)
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
      primaryAssertions: 2,  // started + activeTab
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

  // #9 ラウンド確定(SF#2 反映:最終ラウンド分岐、isFinal 自動判定は §10 Stage 2b 申し送り)
  roundConfirmed: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length + 1);
      if (!options.isFinal) {
        // 中間ラウンド: 次 pairings 生成を必須
        expectStateChanged(before, after, `state.pairings.${cls}`);
      }
      // 最終ラウンドの場合は次 pairings 不要(state.pairings は更新されない、または空配列)
    },
    meta: {
      primaryAssertions: 1,  // results.length 増加(isFinal 時)、または + pairings 変化(中間時)
      primaryTypes: ['state'],
      operation: 'roundConfirmed',
      description: `${cls}クラスのラウンド確定(${options.isFinal ? '最終' : '中間'})`,
    },
  }),

  // #10 ペアリング再生成(SF#3 反映:同一内容許容オプション、運用ルールは §10 Stage 2b 申し送り)
  pairingsRegenerated: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      // results 不変
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length);
      // pairings の妥当性(人数 × 2 = ペア数)
      expect(after.state.pairings[cls].length * 2).toBe(before.state.players[cls].length);
      if (!options.allowSameContent) {
        // 内容が変化していること
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
      // results は不変
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
      // length は不変(名前のみ変更)
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
      const beforeMember = before.master.members.find(m => m.id === targetId);
      const afterMember = after.master.members.find(m => m.id === targetId);
      expect(afterMember).toBeDefined();
      expect(stableStringify({ name: afterMember.name, yomi: afterMember.yomi }))
        .not.toBe(stableStringify({ name: beforeMember.name, yomi: beforeMember.yomi }));
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
      const member = after.master.members.find(m => m.id === targetId);
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

  // #17 マスタインポート実行(SF#4 反映:既存不変 + tombstone OR + schema_version)
  masterImported: (options = {}) => ({
    assertion: async (before, after, page) => {
      const { expectedNewCount = 0, existingMemberIds = [], tombstoneOrIds = [] } = options;
      // 新規 member の length 増加
      expect(after.master.members.length).toBe(before.master.members.length + expectedNewCount);
      // 既存 member の name/yomi 不変
      for (const id of existingMemberIds) {
        const beforeMember = before.master.members.find(m => m.id === id);
        const afterMember = after.master.members.find(m => m.id === id);
        expect(afterMember.name).toBe(beforeMember.name);
        expect(afterMember.yomi).toBe(beforeMember.yomi);
      }
      // tombstone OR: 指定 id の deleted が true
      for (const id of tombstoneOrIds) {
        const member = after.master.members.find(m => m.id === id);
        expect(member.deleted).toBe(true);
      }
      // schema_version 維持
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
  tournamentDataCopied: () => ({
    assertion: async (before, after, page) => {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      const parsed = JSON.parse(text);
      expect(parsed.players).toEqual(before.state.players);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['clipboard'],
      operation: 'tournamentDataCopied',
      description: '大会データをクリップボードにコピー',
      requiredPermissions: ['clipboard-read', 'clipboard-write'],
    },
  }),

  // #19 読み込み実行(貼付)
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

  // #20 読み込み実行(ファイル)
  stateLoadedFromFile: (filePath, expectedPlayersA, expectedPlayersB) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, 'state');
      if (expectedPlayersA != null) expect(after.state.players.A.length).toBe(expectedPlayersA);
      if (expectedPlayersB != null) expect(after.state.players.B.length).toBe(expectedPlayersB);
    },
    beforeClick: async (page) => {
      // ファイル選択ダイアログを Playwright API で代替
      await page.locator('#load-pick-file').setInputFiles(filePath);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateLoadedFromFile',
      description: 'ファイルから state を復元',
    },
  }),

  // #21 リセット(master 不変が重要)
  stateReset: () => ({
    assertion: async (before, after, page) => {
      expect(after.state.players.A.length).toBe(0);
      expect(after.state.players.B.length).toBe(0);
      expect(after.state.started).toBe(false);
      expect(after.localStorage.shogi_v4).toBeNull();
      // master 温存(L0 §4.1)
      expect(after.localStorage.shogi_branch_master)
        .toBe(before.localStorage.shogi_branch_master);
    },
    meta: {
      primaryAssertions: 5,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateReset',
      description: 'state 初期化(master 温存)',
    },
  }),

  // #22 報告書ダウンロード(SF#1 統一、3 モード対応、Stage 2a 実装着手時に確定)
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
      // 各モードに応じた spy を注入
      if (mode === 'window-print') {
        await page.evaluate(() => {
          window.__printCalled = false;
          const orig = window.print;
          window.print = function () { window.__printCalled = true; return orig && orig.apply(this, arguments); };
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
          document.addEventListener('click', (e) => {
            if (e.target && e.target.tagName === 'A' && e.target.hasAttribute('download')) {
              window.__downloadTriggered = true;
            }
          }, true);
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
```

### 4.4 ChatGPT v1.1 再レビュー Should Fix の吸収

| Should Fix | 吸収箇所 |
|---|---|
| #1 報告書 assertion 統一 | §3.4 #22 + §4.3 `reportDownloaded`(3 モード対応 + beforeClick spy 注入) |
| #2 pairings/results 用語整理 | §3.4 #9/#10/#12 + §4.3 各 assertion |
| #3 P0/P1/P2 Stage 適用範囲 | §3.6 表(v1.1 で P2 を P0 に統合) |

### 4.5 ChatGPT v1.0 → v1.1 Stage 2a 仕様書レビュー指摘の吸収

| 指摘 | 吸収箇所 | 対応 |
|---|---|---|
| Must Fix #1: primary assertion 必須化を機械保証 | §3.2 + §4.3 全 factory + §5.1 + §5.2 + §6 | factory 形式 + ctx 形式併存、`primaryCount >= 1` 検証 |
| Must Fix #2: clipboard/print/file を扱える API 拡張 | §3.2 options 拡張 + §4.3 #18/#20/#22 | `options.beforeClick/afterClick`、factory に beforeClick/afterClick 内蔵、page 引数追加 |
| Should Fix #1: B クラス pairings 確認 | §3.4 #6 + §4.3 `tournamentStarted` | 反映 |
| Should Fix #2: ラウンド確定の最終分岐 | §3.4 #9 + §4.3 `roundConfirmed` | `options.isFinal` |
| Should Fix #3: ペアリング再生成の同内容扱い | §3.4 #10 + §4.3 `pairingsRegenerated` | `options.allowSameContent` |
| Should Fix #4: マスタインポート分離検証 | §3.4 #17 + §4.3 `masterImported` | `options.expectedNewCount/existingMemberIds/tombstoneOrIds` で分離 |
| Should Fix #5: clipboard permission | §3.4 #18 + §4.3 `tournamentDataCopied` + §6 | `meta.setupRequired` 明示(v1.2 で `requiredPermissions` に構造化) |
| Should Fix #6: サンプル e2e 修正 | §5.2 | 「primary なしで赤」を実テストに |
| Should Fix #7: 完了基準に「primaryAssertions=0 が赤」 | §6 | 追加 |
| Nice to Have #1: DOM query snapshot option | §3.2 `getStateSnapshot(page, options)` | 反映 |
| Nice to Have #2: hit-test 小要素対応 | §3.1 step 6 | 反映 |
| Nice to Have #3: stableStringify helper | §3.7(新設) + 各 factory で活用 | 反映 |
| Nice to Have #4: Codex Yes YAML 仮定義 | §6 末尾 | 反映 |

### 4.6 ChatGPT v1.1 → v1.2 再レビュー指摘の吸収(本 v1.2 で吸収)

| 指摘 | 吸収箇所 | 対応 |
|---|---|---|
| Should Fix #1: raw callback の `ctx.primary()` 悪用余地 | §3.2 末尾「raw callback 形式の使用ガイドライン」+ §6 Codex YAML | factory 形式を P0 必須化、raw callback はサンプル/例外用、`ctx.primary()` 直後に `expect(...)` 必須、Codex YAML で `raw_callback_usage_count` 観測 |
| Should Fix #2: `meta.setupRequired` 構造化 | §4.3 #18 `tournamentDataCopied` + §6 完了基準 + §5.2 サンプル e2e | `setupRequired` 文字列を `requiredPermissions: string[]` に構造化、完了基準で permission 付与 + clipboard read/write 成功検証、サンプル e2e に正常系 1 件追加 |
| Should Fix #3: 「実装着手時 grep で微調整」の確定/作業メモ分離 | §3.4「確定仕様 vs 実装時確認の分離」 | factory 名/責務/primary 種別/failure 条件は確定仕様(変更不可)、selector/関数名/mode 分岐は実装時確認可、責務変更は v1.3 仕様書更新対象 |
| Should Fix #6: P2→P0 統合の説明補足 | §3.6「v1.2 補足」 | L0 §1.5 P2 区分は維持、Stage 2a 検証実装範囲上の統合であることを明文化、L0 更新時の優先順位を明記 |
| Nice to Have #3: factory 型定義を JSDoc で明示 | §4.3 冒頭 + §3.2 `clickAndExpectChange.js` 冒頭 | `ExpectedChangeFactory` typedef を `shogi_assertions.js` に定義、`clickAndExpectChange.js` から参照 |
| 回帰懸念 #1〜#3: API 高機能化 / Stage 範囲拡大 / raw callback 規律 | §8 リスクと緩和(3 行追加) | factory 形式標準化、Stage 2a 完了条件絞込、Codex YAML 観測 |
| Should Fix #4: `roundConfirmed` `isFinal` 自動判定 | §10(新設、Stage 2b 申し送り) | 案A/案B を Stage 2b 仕様書で選定 |
| Should Fix #5: `pairingsRegenerated` `allowSameContent` 運用ルール | §10(新設、Stage 2b 申し送り) | 原則 false / true 使用時の理由明記 / 主要テストの設計を Stage 2b で正式化 |

**v1.2 で扱わなかった任意項目(後段で対応可)**:
- Nice to Have #1: factory meta に `selector` / `stage` / `priority`(Stage 2b の置換進捗表で必要になった時点で追加)
- Nice to Have #2: `clickAndExpectChange` の戻り値を `{ before, after, meta }` に拡張(デバッグ要件が出た時点で追加)
- Nice to Have #4: `stableStringify` 循環参照非対応の明記 → §3.7 で実施済み(v1.2 でコメント強化として処理)

---

## 5. テスト計画

### 5.1 ヘルパ単体テスト

#### `expectClickable.test.js`

A-T spec v1.3 §4.2 各段階の正常系・異常系を網羅。特に:
- 物理的不在/不可視/無効化で赤(段階 1)
- `pointer-events: none` / `opacity: 0.3` で赤(段階 4)
- 祖先 `display: none` / `inert` で赤(段階 5)
- 中央点が overlay でブロックされる場合に赤(段階 6)
- 角の点がブロックされる場合に赤(段階 6)
- 全条件クリアで緑
- **小要素(width<4px)で中央 1 点のみ評価される**(NH#2 検証)

#### `clickAndExpectChange.test.js`(Must Fix #1 連動)

| テスト名 | 期待動作 |
|---|---|
| factory 戻り値 + meta.primaryAssertions=1 で緑 | 通常 success |
| factory 戻り値 + meta.primaryAssertions=0 で赤 | **`primary semantic assertion is required` でエラー** |
| raw callback + ctx.primary() 1 回呼出で緑 | 通常 success |
| raw callback + ctx.primary() 0 回呼出で赤 | **同上のエラー** |
| raw callback + 通知のみ確認 + ctx.primary() なしで赤 | **「通知だけテスト」が書けないことの実証** |
| `expectClickable` が失敗した場合、`expectedChange` は呼ばれない | クリック前段階で fail |
| `options.beforeClick` / `options.afterClick` が順序通り実行される | spy で実行順序を検証 |
| factory の `beforeClick` / `afterClick` も自動拾われる | 同上 |
| `getStateSnapshot` が DOM query option を反映する(NH#1) | options.selectors 検証 |

#### `shogi_assertions.test.js`(全 22 factory の meta 検証)

各 factory に対して:
- `meta.primaryAssertions >= 1` を保証
- `meta.operation` が一意の文字列
- `meta.primaryTypes` が定義された値
- 必要な factory(`stateLoadedFromFile` / `reportDownloaded`)に `beforeClick` が存在
- **`tournamentDataCopied` の `meta.requiredPermissions` が `['clipboard-read', 'clipboard-write']` を含む**(v1.2 で SF#2 反映)

### 5.2 サンプル e2e テスト(Should Fix #6 反映、v1.2 で clipboard 系 1 件追加 = SF#2 実態保証)

`test/e2e/sample/at_stage_2a_sanity.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../../helpers/clickAndExpectChange');
const { shogiAssertions } = require('../../helpers/shogi_assertions');

test.describe('A-T Stage 2a sanity', () => {

  test('正常系: 参加者追加が factory で緑になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 太郎');
    await page.locator('#inp-yomi').fill('テスト タロウ');
    await page.locator('#inp-class').selectOption('A');

    await clickAndExpectChange(
      page.locator('#addBtn'),
      shogiAssertions.participantAdded('A')
    );

    // 補助 assertion(任意)
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });

  test('異常系: primary assertion 0 件の expectedChange は必ず赤になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 次郎');
    await page.locator('#inp-yomi').fill('テスト ジロウ');
    await page.locator('#inp-class').selectOption('A');

    // 空の expectedChange を渡すと、primary assertion 0 件で fail することを検証
    let errorCaught = null;
    try {
      await clickAndExpectChange(
        page.locator('#addBtn'),
        async (before, after, ctx) => {
          // ctx.primary() を呼ばない = primary assertion 0 件
        }
      );
    } catch (e) {
      errorCaught = e;
    }
    expect(errorCaught, 'primary assertion 0 件で必ずエラーになるべき').not.toBeNull();
    expect(errorCaught.message).toMatch(/primary semantic assertion is required/);
  });

  test('異常系: 通知のみの expectedChange も赤になる(ctx.primary() を呼ばない)', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 三郎');
    await page.locator('#inp-yomi').fill('テスト サブロウ');
    await page.locator('#inp-class').selectOption('A');

    let errorCaught = null;
    try {
      await clickAndExpectChange(
        page.locator('#addBtn'),
        async (before, after, ctx, page) => {
          // 通知のみ確認(これは補助 assertion であり primary ではない)
          await expect(page.locator('#reg-msg')).toBeVisible();
          // ctx.primary() を呼ばない → 必ず赤
        }
      );
    } catch (e) {
      errorCaught = e;
    }
    expect(errorCaught, '通知のみ確認では必ずエラーになるべき').not.toBeNull();
    expect(errorCaught.message).toMatch(/primary semantic assertion is required/);
  });

  test('正常系: 大会データコピーが clipboard primary で緑になる(v1.2、SF#2 実態保証)', async ({ page, context }) => {
    // SF#2: meta.requiredPermissions の実態保証
    // tournamentDataCopied の meta.requiredPermissions に基づき context permission を付与する流れを実証
    const factory = shogiAssertions.tournamentDataCopied();
    const requiredPermissions = factory.meta.requiredPermissions || [];
    if (requiredPermissions.length > 0) {
      await context.grantPermissions(requiredPermissions);
    }

    await page.goto('/shogi_v4.html');
    // 最低限 1 名以上の参加者がいる状態でないとコピー対象がないため事前準備
    await page.locator('#inp-name').fill('テスト 四郎');
    await page.locator('#inp-yomi').fill('テスト シロウ');
    await page.locator('#inp-class').selectOption('A');
    await page.locator('#addBtn').click();

    await clickAndExpectChange(
      page.locator('#saveBtn'),
      factory
    );

    // 補助 assertion: clipboard 内容を直接読んで JSON parse 可能であることを再確認
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(() => JSON.parse(text)).not.toThrow();
  });

});
```

---

## 6. 完了基準

A-T spec v1.3 §Stage 2a 完了基準準拠 + 本仕様書 v1.2 追加項目:

- ✅ `expectClickable` ヘルパが §3.1 の 7 段階検証すべてを実装(NH#2 小要素対応含む)
- ✅ `clickAndExpectChange` ヘルパが §3.2 の API 拡張(factory + ctx 併存、options.beforeClick/afterClick、page 引数)を実装
- ✅ `getStateSnapshot` が L0 §4.1 の 3 LocalStorage キー + state + master + url + activeTab を取得、NH#1 DOM query option 対応
- ✅ `stableStringify` + `expectStateChanged/Unchanged` ヘルパ実装(§3.7、NH#3、循環参照非対応の明記含む)
- ✅ `shogi_assertions.js` に §3.4 の 22 factory が完備、全 factory が `meta.primaryAssertions >= 1` を持つ
- ✅ `shogi_assertions.js` 冒頭に `ExpectedChangeFactory` typedef が JSDoc 形式で記載(v1.2、NH#3)、`clickAndExpectChange.js` 冒頭から参照
- ✅ §3.5 新規操作追加ルールが仕様書に明記
- ✅ ヘルパ単体テスト(§5.1):合計 25 件以上、全件緑
- ✅ **`primaryAssertions=0` の expectedChange を渡すと必ず赤になる単体テスト + e2e テストが緑(SF#7 連動)**
- ✅ **`tournamentDataCopied` の `meta.requiredPermissions = ['clipboard-read', 'clipboard-write']` 検証が単体テストで緑**(v1.2、SF#2 反映)
- ✅ **`meta.requiredPermissions` を持つ factory(v1.2 時点で `tournamentDataCopied` のみ)について、サンプル e2e で `context.grantPermissions(meta.requiredPermissions)` を実行し、`navigator.clipboard.readText()` が実際に成功することを検証**(v1.2、SF#2 実態保証)
- ✅ サンプル e2e テスト(§5.2):正常系 2 件 + 異常系 2 件、計 4 件全件緑(v1.2 で clipboard 系 1 件追加、異常系は「赤になることを期待」して try/catch で緑)
- ✅ リポジトリ全体の `force: true` 使用箇所がゼロ(grep 検証、Stage 1 で既達確認済み)
- ✅ 既存 e2e 124 テスト(130 click)に影響なし(全件緑のまま)
- ✅ raw callback 形式の使用箇所がサンプル e2e および helper 単体テスト以外には存在しない(grep 検証、v1.2、SF#1 反映)
- ✅ Codex フェーズ境界レビュー A 以上

### Codex Yes YAML 仮定義(NH#4、v1.2 で 3 項目追加、Stage 2c で正式化)

```yaml
codex_l4_review:
  expect_clickable_helper_exists: true
  click_and_expect_change_helper_exists: true
  primary_assertion_enforced_machine: true     # Must Fix #1 機械検証
  primary_assertion_zero_case_fails: true      # SF #7
  shogi_assertion_factory_count: 22            # §3.4 全 22 factory
  all_factories_have_meta_primary_count: true  # 全 factory の meta 検証
  factory_clipboard_print_supported: true      # Must Fix #2
  options_beforeclick_afterclick_supported: true  # Must Fix #2
  force_true_in_helpers: 0
  sample_e2e_green: true
  sample_e2e_negative_assertion_works: true    # 異常系 2 件が「赤を期待して緑」

  # v1.2 追加(ChatGPT v1.1 再レビュー反映)
  factory_required_permissions_validated: true  # SF#2: meta.requiredPermissions が単体 + e2e で検証済み
  expected_change_factory_typedef_exists: true  # NH#3: JSDoc typedef が shogi_assertions.js + clickAndExpectChange.js に存在
  raw_callback_usage_count: 3                   # SF#1: helper 単体テスト 2 + サンプル e2e 異常系 1 のみ(P0 e2e では 0 を維持)

  verdict: "Yes"
```

`raw_callback_usage_count` の閾値は Stage 2c で正式化(暫定: 「helper テスト + サンプル e2e 異常系」以外でカウントが増えた場合は ChatGPT/Codex 重点確認)。

---

## 7. 受け入れ基準

- 本仕様書(v1.2)が ChatGPT メタレビュー A 以上(v1.2 再レビュー、A 判定狙い)
- 実装後、Codex フェーズ境界レビュー A 以上
- DevSecOps v1.2.5 §13 段階 1 自動マージ範囲(test/typo/docs)に該当(production code `shogi_v4.html` への変更なし)
- A-T spec v1.3 §6 受け入れ基準と整合

---

## 8. リスクと緩和

| リスク | 影響 | 緩和策 |
|---|---|---|
| `getStateSnapshot` が重く e2e 全体時間増加 | CI 時間増 | deep clone コストを計測、必要なら主要キーのみに限定 |
| `expectClickable` 7 段階で正常な要素まで fail | テスト不安定化 | ヘルパ単体テストで正常パターン緑を証明、Stage 2b 置換時にも漸進検証 |
| `shogi_assertions.js` カタログが Stage 2b で不足判明 | Stage 2b で再修正 | §3.5 新規操作追加ルールに従い不足分を追加 |
| `#22` 報告書 mode が想定と異なる | factory 修正 | §3.4 末尾の grep スクリプトで実装着手時に確認 |
| factory 形式と raw callback 形式の混在で利用者混乱 | テスト書きにくさ | サンプル e2e + ヘルパ単体テストで両形式の使用例を明示、Stage 2b では factory 形式を推奨 |
| **API 高機能化(v1.1 拡張)で Stage 2a 実装難度上昇**(回帰懸念 #1) | テスト書きにくさ・実装工数増 | factory 形式を Stage 2a 標準とする(§3.2 末尾ガイドライン)、helper 単体テスト → state 系 factory → clipboard/file/print 系の順で段階実装、Codex YAML(`factory_clipboard_print_supported` + `factory_required_permissions_validated`)で進捗観測 |
| **Stage 2a 範囲拡大(v1.1 で P2 を P0 統合)**(回帰懸念 #2) | Stage 2a 工数増 | Stage 2a 完了条件は「P0 22 factory の存在 + 単体テスト + サンプル e2e 4 件」に限定(§6)、既存 spec 置換は Stage 2b 以降、P0 内でも clipboard/file/print 系は専用ブロック(§4.3 #18 / #20 / #22)として分離実装 |
| **raw callback 形式の悪用余地**(回帰懸念 #3、`ctx.primary()` 形式的呼出し) | 形式的 primary が再発、A-4.2 型バグ再発 | §3.2 末尾 raw callback ガイドライン(P0 は factory 必須、`ctx.primary()` 直後に `expect(...)` 必須)、Codex YAML で `raw_callback_usage_count` 観測、ChatGPT/Codex 独立レビューで P0 e2e の raw callback 使用箇所を重点確認 |

---

## 9. 参照

- A-T 仕様書 v1.3:`docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- A-T Stage 1 完了レポート:`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1:`docs/specs/_business_model.md`(commit a5fda4a)
- DevSecOps 運用方針 v1.2.5:shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- 本仕様書 v1 用 ChatGPT メタレビュー依頼:`docs/specs/20260506_0758_shogi_at_stage_2a_chatgpt_review_prompt.md`
- 本仕様書 v1 → v1.1 ChatGPT メタレビュー結果(Must Fix 2 + Should Fix 7 + Nice to Have 4 を v1.1 で全吸収)
- 本仕様書 v1.1 ChatGPT 再レビュー依頼:c86ef2d で main にコミット済み
- 本仕様書 v1.1 → v1.2 ChatGPT 再レビュー結果(A-、Should Fix 6 + Nice to Have 4 + 回帰懸念 3 を v1.2 で吸収。SF#1〜#3, #6, NH#3, 回帰懸念 3 は本 v1.2 で反映、SF#4/#5 は §10 Stage 2b 申し送り、NH#1/#2 は後段)

---

## 10. Stage 2b 申し送り(v1.2 で確定、Stage 2b 仕様書で再設計)

ChatGPT v1.1 再レビューで提示された Should Fix #4 / #5 は、Stage 2a 実装範囲では決着せず、Stage 2b(既存 spec 置換)で扱う。本節は Stage 2b 仕様書起草時の入力として方向性のみを残す(決定は Stage 2b で行う)。

### 10.1 Should Fix #4: `roundConfirmed(cls, options)` の `isFinal` 自動判定

**現状(v1.2 / Stage 2a)**:

- `options.isFinal=true` をテスト側で手指定
- 中間ラウンドの場合は次 pairings 生成を必須検証、最終ラウンドの場合は不要

**問題意識(ChatGPT v1.1 再レビュー指摘)**:

- テスト側で `isFinal` を渡すと指定ミスのリスクがある(最終ラウンドなのに `isFinal=false` で渡すと、生成されない pairings を期待して必ず赤になる、またはその逆)
- Stage 2b で既存 spec を `clickAndExpectChange` に置換する際、`isFinal` の指定漏れが頻発する可能性がある

**Stage 2b で検討する案**:

- **案A(明示派)**:`roundConfirmed(cls, { isFinal })` を維持。テスト側は `before.state.results[cls].length + 1 >= before.state.rounds` から算出。呼び出し側責任、明示的、副作用なし。判定ロジックの透明性が高い反面、置換ミスが頻発しうる。
- **案B(自動派)**:factory 内で `before.state.results[cls].length + 1 >= before.state.rounds` を見て自動判定。factory 側責任、暗黙、`isFinal` を渡す必要なし。置換ミスを構造的に減らせる反面、`state.rounds` の意味が変わった場合に factory も追従修正が必要。

**Stage 2b 仕様書で確定すべき事項**:

- 案A / 案B のいずれを採用するか(判断基準: Stage 2b の既存 spec 置換時の指定ミス頻度予測、`state.rounds` 変更頻度予測)
- 移行時の互換性(v1.2 では `options.isFinal` を受け取る形を維持するため、案B 採用時も `options.isFinal` 指定は引き続き優先する後方互換にするか)

### 10.2 Should Fix #5: `pairingsRegenerated(cls, options)` の `allowSameContent` 運用ルール

**現状(v1.2 / Stage 2a)**:

- `options.allowSameContent=true/false` をテスト側で手指定(既定 false)
- false の場合、再生成で内容変化を必須検証

**問題意識(ChatGPT v1.1 再レビュー指摘)**:

- 安易に `allowSameContent=true` にすると「再生成ボタンを押しても何も変わらない」バグを見逃す可能性
- テストデータの設計(参加者数 / 過去対戦履歴)次第で内容変化が起きないケースがある

**Stage 2b で検討する運用ルール**:

- 原則 `allowSameContent=false`(既定値継続)
- `allowSameContent=true` を使う場合、テスト名またはコメントに理由を必須記載(grep 可能な書式)
- Stage 2b の主要テストでは「再生成で内容が変わり得るテストデータ」を意図的に設計
- `allowSameContent=true` の場合も、`results` 不変 + `pairings` の妥当性(人数 × 2 = ペア数等)は必ず検証

**Stage 2b 仕様書で確定すべき事項**:

- 運用ルールの正式化(コメント書式の例、grep スクリプト)
- Codex YAML に `allow_same_content_true_count` を観測対象として追加(多用時に警告)
- テストデータ設計のガイドライン(参加者数 4 名以上 + 過去対戦 0 件のような「再生成が必ず変化する」条件を満たすパターン)

---

**END**
