# Phase A-T Stage 2a 仕様書 v1.5:UI テストヘルパ実装(`expectClickable` + `clickAndExpectChange` + `triggerInputFileAndExpectChange`)

**配置先**: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(同名上書き、v1.4 → v1.5)
**最終更新**: 2026-05-06 14:50 JST
**対象ブランチ**: `feat/phase-a-t-stage-2a-helpers`(main 1aa8e02 から派生、現 HEAD 7afd060 = Stage 2a 実装完了)
**準拠**: A-T spec v1.3、DevSecOps 運用方針 v1.2.5、L0 業務モデル文書 v1.1
**位置づけ**: A-T フェーズ Stage 2a の実装仕様書。Stage 2b/2c/4 の前提となるヘルパ基盤の設計を確定する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1 | 2026-05-06 07:52 | 初版起草。A-T spec v1.3 §0.2/§4/§5 + Stage 1 レポート §4.6 + L0 業務モデル文書 v1.1 §1.5 P0 を統合 | Claude.ai |
| v1.1 | 2026-05-06 08:05 | ChatGPT B+ レビュー反映: Must Fix 2 件 + Should Fix 7 件 + Nice to Have 4 件すべて吸収 | Claude.ai |
| v1.2 | 2026-05-06 10:07 | ChatGPT v1.1 再レビュー A- 反映: SF#1/#2/#3/#6 + NH#3 + 回帰懸念 3 件吸収。SF#4/#5 は §10 Stage 2b 申し送りに移管 | Claude.ai |
| v1.3 | 2026-05-06 11:53 | Codex 独立レビュー B+ 反映: Must Fix 2 件吸収(§5.2 raw click 排除 + ファイル系専用ヘルパ `triggerInputFileAndExpectChange` 新設、`stateLoadedFromFile` 再設計)+ Should Fix 3 件(`scrollIntoViewIfNeeded` 復活 / hit-test コメント / Codex YAML 内訳分離)+ Nice to Have 2 件(file input 型ヘルパ別 API / `requiredPermissions` factory 一覧)吸収。`shogi_v4.html` 実体確認(L94 `#loadFile` 隠し input / L3411 `#load-pick-file` 仲介ボタン / L3673 change handler / L1632 `#mi-file` 可視 input / L1666 `#mi-run`)に基づく構造修正 | Claude.ai |
| v1.4 | 2026-05-06 13:07 | Codex v1.3 再レビュー B+ 反映: Must Fix 2 件吸収(`stateLoadedFromFile` の confirm + FileReader 非同期 + alert 実体接続を §4.3 #20 に反映 / §3.4 表 #20 と §4.3 #20 の factory 署名整合) + Should Fix 1 件(§3.4 末尾に「confirm-gated P0 操作一覧 + dialog handling 標準形」追加、stateLoaded/stateReset/masterImported(overwrite) も含む)吸収。stateLoaded/stateReset/masterImported(file経由) の factory レベル対応は §10.4 Stage 2b 申し送りに移管。Stage 2a テスト側責任として §3.4 末尾に明記。Claude Code 実体調査(loadData() L?? + loadFromPaste() L?? + resetAll() L3631-) に基づく実体接続修正 | Claude.ai |
| v1.5 | 2026-05-06 14:50 | Stage 2a 実装(commit 7afd060、全 438 件緑)で発覚した spec 見落とし 5 件を反映: ①§3.1 段階 0 `scrollIntoViewIfNeeded` に `timeout=1000` + try/catch(display:none との auto-wait 衝突回避) ②§3.1 段階 6 hit-test の `inset` を border-radius に応じ動的計算 `max(2, ceil(br * 0.35))`(spec の固定 `inset=2` が border-radius >= 4px の要素で角座標を親要素にヒットさせる問題、ゆえに) ③§4.1 `getStateSnapshot.js` の localStorage アクセスを各キー個別に try/catch(about:blank/setContent ページでの SecurityError フォールバック) ④§4.3 #18 `tournamentDataCopied` factory に `beforeClick`(alert auto-accept)+ assertion 内で clipboard polling 待ち(`saveData()` の `writeText().then(alert)` 非同期対応、Codex MF#1 同系統) ⑤§4.3 #18 assertion の比較対象を `before.state.players` から `after.state.players` に変更(`syncBranchMasterOnSave()` が新規 player に member_id を補完する production mutation 事実)。§4.9 新設で Stage 2a 実装→spec 同期マトリクス。§10.5 で「他 factory での同種パターン再発リスク」を Stage 2b 申し送り | Claude.ai |

---

## 1. 経緯と背景・スコープ

### 1.1 経緯

A-4.2(commit 73961d3)で A/B クラスボタンが実機では動作しないリグレッションが発生したが、e2e 124 件 / 単体 595 件のテストすべてを通過した。Stage 1 完了レポート(commit 3f38a13)で「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。

A-T spec v1.3 §4.2/§4.3 で `expectClickable` + `clickAndExpectChange` の 2 ヘルパが設計された。Stage 2a は**この 2 ヘルパの実装と shogi 固有 primary assertion カタログの整備**を担う。

v1.3 では Codex 独立レビューにより、ファイル選択操作の構造的特殊性(`#loadFile` 隠し input + `#load-pick-file` 仲介 button + change handler の 3 段構造)が判明。`expectClickable` の枠を構造的に外す **`triggerInputFileAndExpectChange`** ヘルパを新設してファイル系を分離。

### 1.2 スコープ

#### スコープ内(IN)

- `test/helpers/expectClickable.js` 実装(A-T spec v1.3 §4.2 + Nice to Have #2 小要素対応 + v1.3 で `scrollIntoViewIfNeeded()` 復活)
- `test/helpers/clickAndExpectChange.js` 実装(A-T spec v1.3 §4.3 + Must Fix #1/#2 解決の API 拡張)
- **`test/helpers/triggerInputFileAndExpectChange.js` 実装**(v1.3 で新設、ファイル系専用ヘルパ、`expectClickable` をスキップして `setInputFiles` 直接実行)
- `test/helpers/getStateSnapshot.js` 実装(L0 §4.1 LocalStorage キー対応 + Nice to Have #1 DOM query option、`clickAndExpectChange.js` と `triggerInputFileAndExpectChange.js` の両方から共通利用)
- `test/helpers/stableStringify.js` 実装(Nice to Have #3)
- `test/helpers/shogi_assertions.js` 実装(L0 §1.5 P0 19 操作 → 22 factory)
- 上記ヘルパの単体テスト(`test/helpers/*.test.js`)
- サンプル e2e テスト 1 ファイル(正常系 + 異常系の 4〜5 件、`primaryAssertions=0` で必ず赤 + clipboard 系 1 件 + ファイル系 1 件)
- v1.1 既存 e2e(`test/e2e/*.spec.js` 124 件)への影響なし
- production code `shogi_v4.html` への変更なし(DevSecOps v1.2.5 §13 段階 1 自動マージ範囲)
- v1.2 で Should Fix #1〜#3, #6 + Nice to Have #3 + 回帰懸念 3 件への対策反映済み(本 v1.3 で維持)
- v1.3 で Codex Must Fix #1/#2 + Should Fix #1〜#3 + Nice to Have #1/#2 への対策反映

#### スコープ外(OUT、Stage 2b 以降)

- 既存 e2e の置換(Stage 2b で実施、A-4.2 関連を優先)
- A-7 / A-8 等の新規 click 操作追加(各フェーズで `shogi_assertions.js` に追記)
- L0 §1.5 P1(モーダル開閉 11 操作)の DOM 表示変化 assertion 整備(Stage 2b)
- Codex L4 レビューの正式 YAML 化(Stage 2c で正式化、本仕様書では仮定義)
- `roundConfirmed` の `isFinal` 自動判定(Should Fix #4、§10 Stage 2b 申し送り)
- `pairingsRegenerated` の `allowSameContent` 運用ルール正式化(Should Fix #5、§10 Stage 2b 申し送り)
- `masterImported` の confirm 受諾 / mi-mode ラジオ設定 / 異常系(両方指定エラー / 両方空エラー)の正式化(v1.3 §3.4 末尾の「実装時確認可」に注記、Stage 2b 仕様で正式化)

### 1.3 ユーザーストーリー

#### US-1: テスト作者が新しい click を書くとき

「私は新しい A-7 機能のテストを書く。`clickAndExpectChange(ボタン, shogiAssertions.someOperation())` と書きたい。書き忘れる primary assertion をヘルパが機械的に塞いでくれる。書き忘れたら必ず赤になる。」

#### US-2: ChatGPT メタレビューが本仕様書を読んだとき

「私は仕様書を読んで、機械保証されている assertion 規律と書き手の規律を区別したい。raw callback 形式の悪用余地が運用ルールでカバーされていることを確認したい(SF#1)。clipboard 系の `requiredPermissions` が文字列メモではなく構造化されていることを確認したい(SF#2)。ファイル系が `clickAndExpectChange` とは別ヘルパで分離されていることを確認したい(v1.3、Codex MF#2)。」

#### US-3: Codex フェーズ境界レビューが Stage 2a を読んだとき

「私はカタログ網羅性、力学的検証、production code 不変、completion criteria 全項目を YAML で機械判定したい。完了判定 YAML は Stage 2c で正式化する前提で、今回は仮定義として用意されていればよい。raw callback の使用箇所と `requiredPermissions` 検証済み factory も観測対象に入れたい(v1.2 追加)。`triggerInputFileAndExpectChange` が `expectClickable` を構造的に外す根拠と、ファイル系 factory の単体 + サンプル e2e 検証が分離されていることを確認したい(v1.3 追加)。」

#### US-4: Stage 2b 担当が本ヘルパを使い始めたとき

「私は A-4.2 関連の既存 spec 7 件を `clickAndExpectChange` に置換する。`shogi_assertions.js` のカタログにある factory を引いて使う。clipboard / print / ファイル選択系も同じヘルパ群で書ける(クリック型は `clickAndExpectChange`、ファイル input 型は `triggerInputFileAndExpectChange`、v1.3)。`isFinal` / `allowSameContent` の運用ルールが §10 で示されているので、置換時の判断に迷わない。」

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
| spec v1.2 main コミット | ✅ 77c5e06 | `git log` |
| spec v1.2 ChatGPT 再レビュー A 判定 | ✅ commit a1c7568 | `git log` |
| spec v1.2 Codex 独立レビュー B+ 判定 | ✅ commit d6832af | `git log` |
| `shogi_v4.html` ファイル系実体確認(v1.3) | ✅ #loadFile L94 / #load-pick-file L3411 / change handler L3673 / #mi-file L1632 / #mi-run L1666 確認済み | Claude Code 調査ログ |
| spec v1.3 main コミット | ✅ db8d5ab | `git log` |
| spec v1.3 ChatGPT 簡易確認 A 判定維持 | ✅ commit e2701bf | `git log` |
| spec v1.3 Codex 独立再レビュー B+ 判定 | ✅ commit 0c96cb2 | `git log` |
| `shogi_v4.html` 実体追加確認(v1.4) | ✅ loadData() / loadFromPaste() / resetAll() の confirm + FileReader + alert 構造確認済み | Claude Code 調査ログ |
| spec v1.4 main コミット | ✅ 260049e | `git log` |
| spec v1.4 Codex Quick Review A 判定 | ✅ commit edca3e5 経由で投入 | Codex 投入結果 |
| Stage 2a 実装完了(commit 7afd060) | ✅ 全 438 件緑(既存 e2e 248 + サンプル 10 + ヘルパ単体 156 + 既存 single-file 24)、force:true 0 件、サンプル e2e raw click 0 件 | `git log` + `npx playwright test` |

---

## 3. 設計

### 3.1 `expectClickable` ヘルパ仕様(A-T spec v1.3 §4.2 + NH#2 小要素対応 + v1.3 SF#1/#2 反映)

```javascript
// test/helpers/expectClickable.js
const { expect } = require('@playwright/test');

async function expectClickable(locator, options = {}) {
  // 段階 0: scrollIntoViewIfNeeded(v1.3 SF#1 で復活、v1.5 で timeout + try/catch 追加)
  // viewport 外の要素を hit-test 前にスクロール可視化する。viewport 外の要素は段階 6(hit-test)で
  // elementFromPoint が null を返して赤になるが、これは「位置の問題」であり「クリック不能」ではない。
  // scrollIntoViewIfNeeded で位置問題を解消した上で他段階を判定する。
  // v1.5: display:none / detached の要素では Playwright auto-wait が hang し、段階 1 toBeVisible に到達しない。
  //       timeout=1000 で打ち切り、失敗は try/catch で握りつぶして段階 1 で正しく赤判定する。
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 1000 });
  } catch (e) {
    // viewport 外でない or 不可視 → 後続段階(toBeVisible / toBeEnabled)で判定
  }

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

  // 段階 4: 計算スタイル(pointer-events / opacity / visibility / borderRadius)
  // v1.5: borderRadius は段階 6 hit-test の inset 動的計算に使う。
  const styles = await handle.evaluate(el => {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      borderRadius: parseFloat(cs.borderTopLeftRadius || '0'),
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
  // v1.3 SF#2 反映: top.contains(el) は「祖先がヒット」を許容するが、これは厳密には NG ケース
  // (祖先 div が click を受け取るが element 本体は隠れている等)を含み得る。本実装では当面
  // top === el || el.contains(top) を採用し、祖先許容は使わない。将来「祖先 div で onclick 委譲」
  // が必要なら個別 factory の beforeClick で代替する。
  // v1.5: inset を border-radius に応じ動的計算。spec の固定 inset=2 では border-radius >= 4px の要素で
  //       角座標が円弧外側 = 親要素にヒットして fail する(実 shogi_v4.html の button が border-radius: 8px)。
  //       円弧 (1 - 1/√2) ≈ 0.293 のため、0.35 倍を使えば角が要素内部に確実に入る。
  const hitTestResult = await handle.evaluate((el, br) => {
    const rect = el.getBoundingClientRect();
    // NH#2: 小要素(width<4 or height<4)では中央 1 点のみ評価
    const isSmall = rect.width < 4 || rect.height < 4;
    const inset = isSmall ? 0 : Math.max(2, Math.ceil(br * 0.35));
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
      // v1.3 SF#2: 祖先許容(top.contains(el))を削除、self-or-descendant のみ許容
      if (top !== el && !el.contains(top)) {
        return {
          ok: false,
          point: [x, y],
          reason: `blocked by ${top.tagName}${top.id ? '#' + top.id : ''}`,
        };
      }
    }
    return { ok: true };
  }, styles.borderRadius);
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

### 3.2 `clickAndExpectChange` ヘルパ仕様(v1.1 で API 拡張、Must Fix #1/#2 解決、v1.3 で責務明示)

**責務**: 標準クリック型操作(button / link / 通常 click 可能要素)に対する「クリック前検証 + クリック + 状態変化検証」。ファイル input 型操作には対応しない(`§3.2.5 triggerInputFileAndExpectChange` を使用)。

```javascript
// test/helpers/clickAndExpectChange.js
const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');
const { getStateSnapshot } = require('./getStateSnapshot');

/**
 * @typedef {import('./shogi_assertions').ExpectedChangeFactory} ExpectedChangeFactory
 *   `clickAndExpectChange` および `triggerInputFileAndExpectChange` に渡す factory の戻り値型。
 *   詳細は §4.3 冒頭の typedef を参照。両ヘルパで共通利用。
 */

/**
 * クリック + 状態変化検証ヘルパ(標準クリック型専用)
 *
 * ファイル input 型操作には対応不可。`§3.2.5 triggerInputFileAndExpectChange` を使用すること。
 *
 * @param {import('@playwright/test').Locator} locator - クリック対象(button / link / 通常 click 可能要素)
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

module.exports = { clickAndExpectChange };
```

#### raw callback 形式の使用ガイドライン(v1.2 で追加、SF#1 反映)

raw callback 形式は柔軟だが、`ctx.primary('...')` を呼ぶだけで実 assertion 無しでも `primaryCount` が増えてしまう悪用余地がある。

機械保証は「primary assertion の宣言回数 >= 1」までであり、「実際に業務状態を検証したこと」は完全には保証できない。したがって、書き手規律で補強する以下の運用ルールを必須とする:

- **L0 §1.5 P0 操作のテストは、原則として factory 形式を必須**(`shogi_assertions.js` のいずれかの factory を使う)
- raw callback 形式はサンプル/例外用途(factory 化されていない探索的テスト、helper 自身の単体テスト等)に限定
- raw callback を使う場合、`ctx.primary('description')` の呼び出し直後に対応する `expect(...)` を必ず書く(コメントだけ、または `await expect(...).toBeVisible()` のような通知確認だけは不可)
- Codex Yes YAML(§6 末尾)の `raw_callback_usage_count` で観測(v1.3 で内訳 `helper_unit` / `sample_negative` / `p0_e2e` に分離)

P0 操作の e2e テストで raw callback を使った場合、ChatGPT メタレビューおよび Codex 独立レビューで重点確認対象とする。

### 3.2.5 `triggerInputFileAndExpectChange` ヘルパ仕様(v1.3 で新設、Codex Must Fix #2 解決)

**責務**: ファイル input 型操作(`<input type="file">` への `setInputFiles` + change イベント発火 + 状態変化検証)。`expectClickable` の枠を構造的に外す。

**新設の理由**: `clickAndExpectChange` は `expectClickable` の通過を前提とするが、ファイル input は以下の構造で `expectClickable` と整合しない:

- `#loadFile`(L94)は `display:none` 隠し input → `expectClickable` 段階 1(`toBeVisible`)で必ず失敗
- `#load-pick-file`(L3411)は仲介 button だが、クリックすると JS で `#loadFile.click()` を呼んでブラウザのファイル選択ダイアログを開こうとする(Playwright の通常 click では制御不能)
- Playwright のベストプラクティスは `setInputFiles(fileInputLocator, filePath)` を直接実行 → file input の `change` イベントが自動発火

したがって、ファイル系操作は **`expectClickable` をスキップ + `setInputFiles` 直接実行** の専用ヘルパで対応する。

```javascript
// test/helpers/triggerInputFileAndExpectChange.js
const { expect } = require('@playwright/test');
const { getStateSnapshot } = require('./getStateSnapshot');

/**
 * ファイル input 型 + 状態変化検証ヘルパ(v1.3 で新設、Codex Must Fix #2 解決)
 *
 * `<input type="file">` に対して `setInputFiles` を実行し、change イベント発火後の状態変化を検証する。
 * `expectClickable` はスキップする(file input は通常 display:none で隠されているため)。
 *
 * @param {import('@playwright/test').Locator} fileInputLocator - file input の Locator
 *   (例: `page.locator('#loadFile')`、`page.locator('#mi-file')`)
 * @param {string | string[]} filePath - setInputFiles に渡すファイルパス
 * @param {Function | ExpectedChangeFactory} expectedChange - clickAndExpectChange と同じ形式
 *   (factory 推奨、raw callback は helper 単体テスト・サンプル例外用)
 * @param {Object} [options]
 * @param {Function} [options.beforeSetFiles] - setInputFiles 前の追加 setup(dialog 受諾、spy 注入等)
 * @param {Function} [options.afterSetFiles] - setInputFiles 後の追加 teardown
 * @param {Object} [options.snapshot] - getStateSnapshot に渡すオプション(NH#1)
 */
async function triggerInputFileAndExpectChange(fileInputLocator, filePath, expectedChange, options = {}) {
  const page = fileInputLocator.page();

  // 1. file input であることを軽量検証(expectClickable より緩い、type="file" のみ確認)
  const inputType = await fileInputLocator.evaluate(el => el.getAttribute('type'));
  expect(inputType, 'triggerInputFileAndExpectChange: locator must be <input type="file">').toBe('file');

  // 2. factory beforeClick / options.beforeSetFiles 実行(setInputFiles 前)
  //    factory の beforeClick / afterClick はクリック型と同じセマンティクスで使う
  //    (clipboard / dialog / spy 注入の用途は同じ)
  if (expectedChange && typeof expectedChange === 'object' && expectedChange.beforeClick) {
    await expectedChange.beforeClick(page);
  }
  if (options.beforeSetFiles) {
    await options.beforeSetFiles(page);
  }

  const before = await getStateSnapshot(page, options.snapshot || {});

  // 3. setInputFiles 実行(クリック不要、change イベントは Playwright が自動発火)
  await fileInputLocator.setInputFiles(filePath);

  // 4. factory afterClick / options.afterSetFiles 実行(change handler の async 完了待ち含む)
  if (expectedChange && typeof expectedChange === 'object' && expectedChange.afterClick) {
    await expectedChange.afterClick(page);
  }
  if (options.afterSetFiles) {
    await options.afterSetFiles(page);
  }

  const after = await getStateSnapshot(page, options.snapshot || {});

  // 5. primary assertion 必須化(clickAndExpectChange と同じロジック、コード重複を許容して責務分離を明示)
  let primaryCount = 0;

  if (typeof expectedChange === 'function') {
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
    await expectedChange.assertion(before, after, page);
    primaryCount = (expectedChange.meta && expectedChange.meta.primaryAssertions) || 0;
  } else {
    throw new Error(
      'triggerInputFileAndExpectChange: expectedChange must be a function or factory result with { assertion, meta }'
    );
  }

  expect(
    primaryCount,
    `primary semantic assertion is required (>= 1), got ${primaryCount}. ` +
    `Use ctx.primary('description') in raw callback, or use a factory from shogi_assertions.js.`
  ).toBeGreaterThanOrEqual(1);
}

module.exports = { triggerInputFileAndExpectChange };
```

**`getStateSnapshot` の集約**: v1.3 では `clickAndExpectChange.js` から `getStateSnapshot` を `getStateSnapshot.js` に分離し、`triggerInputFileAndExpectChange.js` と共通利用する(§4.1 ファイル配置参照)。

### 3.3 primary semantic assertion 必須化

`expectedChange` には以下のいずれかを **1 つ以上必須**で含める。**機械的に検証**(§3.2 / §3.2.5 末尾の `primaryCount` 検証):

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

| # | 操作 | セレクタ | 業務目的 | factory 名 | primary 種類 | ヘルパ | 注 |
|---|---|---|---|---|---|---|---|
| 1 | 参加者追加 | `#addBtn` | 受付フォームから参加者を 1 名登録 | `participantAdded(cls)` | state | clickAndExpectChange | - |
| 2 | クラス選択 A(過去参加者) | `.pp-add-btn[data-cls="A"]` | 過去参加者を A クラスに登録 | `classSelectedFromPast('A')` | state | clickAndExpectChange | - |
| 3 | クラス選択 B(過去参加者) | `.pp-add-btn[data-cls="B"]` | 過去参加者を B クラスに登録 | `classSelectedFromPast('B')` | state | clickAndExpectChange | - |
| 4 | クラス選択 A(サジェスト) | `.suggest-add-btn[data-cls="A"]` | サジェストから A クラスに登録 | `classSelectedFromSuggest('A', expectedMemberId)` | state | clickAndExpectChange | member_id 一致確認 |
| 5 | クラス選択 B(サジェスト) | `.suggest-add-btn[data-cls="B"]` | サジェストから B クラスに登録 | `classSelectedFromSuggest('B', expectedMemberId)` | state | clickAndExpectChange | 同上 |
| 6 | 対局開始 | `#startBtn` | 受付完了、トーナメント開始(タブ遷移を伴う業務目的) | `tournamentStarted()` | state + URL/タブ | clickAndExpectChange | **SF#1 反映:A/B 両方の pairings 確認** |
| 7 | 勝者ボタン p1 | `#wb_{cls}_{i}_p1` | 第 i 組の勝者を p1 に設定 | `winnerSelected(cls, matchIndex, 'p1')` | state | clickAndExpectChange | - |
| 8 | 勝者ボタン p2 | `#wb_{cls}_{i}_p2` | 第 i 組の勝者を p2 に設定 | `winnerSelected(cls, matchIndex, 'p2')` | state | clickAndExpectChange | - |
| 9 | ラウンド確定 | `#submitBtn_{cls}` | 現在ラウンドを確定し次ラウンドを生成 | `roundConfirmed(cls, options)` | state | clickAndExpectChange | **SF#2 反映:`options.isFinal=true` で次 pairings 不要**(`isFinal` 自動判定は §10 Stage 2b 申し送り) |
| 10 | ペアリング再生成 | `#repairBtn_{cls}` | 現在ラウンドの pairings のみを再生成 | `pairingsRegenerated(cls, options)` | state | clickAndExpectChange | **SF#3 反映:`options.allowSameContent=true` で内容変化を任意化**(運用ルール正式化は §10 Stage 2b 申し送り) |
| 11 | 対戦相手変更保存 | `#chg-save` | 現在ラウンドの p1/p2 を変更 | `opponentChanged(cls, matchIndex)` | state | clickAndExpectChange | - |
| 12 | 過去対局勝者変更 | `#ep-p1` / `#ep-p2`(モーダル内) | 確定済みラウンドの勝者を変更 | `pastWinnerChanged(cls, round, matchIndex)` | state | clickAndExpectChange | - |
| 13 | 名前一括編集保存 | `#bulk-save` | 複数参加者の名前を一括変更 | `bulkNamesEdited(cls)` | state | clickAndExpectChange | - |
| 14 | マスタ追加 | `#me-save`(新規時、`data-mid` なし) | 過去参加者マスタに新メンバー追加 | `masterMemberAdded()` | state(master) | clickAndExpectChange | - |
| 15 | マスタ編集 | `#me-save`(既存、`data-mid` 付き) | 既存メンバーの name/yomi を変更 | `masterMemberEdited(targetId)` | state(master) | clickAndExpectChange | - |
| 16 | マスタ論理削除 | マスタ画面の削除ボタン | メンバーを tombstone 化 | `masterMemberDeleted(targetId)` | state(master) | clickAndExpectChange | `deleted_at` 必須 |
| 17 | マスタインポート実行 | `#mi-run` | 貼付 JSON または `#mi-file` 選択 JSON をマスタにマージ | `masterImported(options)` | state(master) | clickAndExpectChange | **SF#4 反映:length 増加 / 既存不変 / tombstone OR / schema_version 維持を分離検証**(`#mi-file` 経由時は `setInputFiles` を beforeClick で実施可、`#mi-file` は可視 input のため `expectClickable` 通過、Stage 2a 実装着手時の追加要件は §3.4 末尾参照) |
| 18 | 大会データコピー | `#saveBtn` | state をクリップボードに JSON 退避 | `tournamentDataCopied()` | clipboard(spy) | clickAndExpectChange | **v1.2 反映:`meta.requiredPermissions = ['clipboard-read', 'clipboard-write']` 構造化** |
| 19 | 読み込み実行(貼付) | `#load-from-paste` | 貼付 JSON で state を置換 | `stateLoaded(expectedPlayersA, expectedPlayersB)` | state + 永続化 | clickAndExpectChange | - |
| 20 | 読み込み実行(ファイル) | `#loadFile`(隠し file input、L94) | ファイルから state を復元 | `stateLoadedFromFile(expectedPlayersA, expectedPlayersB)` | state + 永続化 | **triggerInputFileAndExpectChange**(v1.3、Codex MF#2 反映) | **v1.4 反映:`filePath` は `triggerInputFileAndExpectChange` 引数のため factory から削除。実体は `loadData()` で confirm + FileReader.onload(非同期) + alert の 3 段。factory に `beforeClick` で dialog auto-accept 設定、`afterClick` で `waitForFunction` による state 反映待ち追加。v1.3 反映:`#loadFile` 直接ターゲット、`setInputFiles` 直接実行で change イベント発火、`expectClickable` スキップ。`#load-pick-file` 仲介 button は使わない** |
| 21 | リセット | `#resetBtn` | state を初期化(master 温存) | `stateReset()` | state + 永続化 | clickAndExpectChange | - |
| 22 | 報告書ダウンロード | `#downloadReportBtn` | 月例運営報告書を出力 | `reportDownloaded(mode)` | spy(print/blob/anchor) | clickAndExpectChange | **SF#1 統一:mode = 'window-print' / 'pdf-blob' / 'anchor-download' を Stage 2a 実装着手時に grep で確定** |

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

#### 確定仕様 vs 実装時確認の分離(v1.2 で追加、SF#3 反映、v1.3 で `masterImported` 追加要件を追記)

**確定仕様(v1.3 で固定、Stage 2a 実装着手後の変更不可)**:

- **factory 名**(全 22 個、§3.4 表「factory 名」列):`participantAdded`, `tournamentStarted` 等。改名や統合は不可
- **各 factory の責務**(§3.4 表「業務目的」列):業務目的の 1 文表現。範囲拡張・縮小は不可
- **primary assertion の種別**(§3.4 表「primary 種類」列):`state` / `state-master` / `clipboard` / `spy` / `state+localStorage` / `state+tab` 等。種別変更は不可
- **使用ヘルパ**(§3.4 表「ヘルパ」列、v1.3 追加):`clickAndExpectChange` / `triggerInputFileAndExpectChange` のいずれか。変更は不可(`stateLoadedFromFile` を `clickAndExpectChange` で扱おうとすると Codex MF#2 が再発する)
- **failure 条件**(§3.2 / §3.2.5 + §3.3):primary assertion が 1 件未満で必ず赤、`primaryAssertions=0` で赤

**実装時確認可(Stage 2a 実装着手時に上記 grep + 実体確認で確定)**:

- 実 selector(`#addBtn` 等の最終確認、命名揺れがあれば実体に合わせる)
- 実装関数名(`generatePairing` / `mergeMaster` / `printResults` の実体)
- mode 分岐の細部(`reportDownloaded(mode)` の 3 モードのうち実体に合致するもの)
- **`masterImported`(#17)の追加要件**(v1.3 で追加、Stage 2a 実装着手時に確定):
  - `mi-mode` ラジオボタンの設定(`merge` / `overwrite`)はテスト側で `page.locator('input[name="mi-mode"][value="merge"]').check()` 等で実施
  - `overwrite` モード時の `confirm()` ダイアログ受諾は `factory.beforeClick` で `page.on('dialog', d => d.accept())` を仕込む
  - ファイル経由の場合: `setInputFiles(#mi-file, filePath)` を `factory.beforeClick` で実施。`#mi-file` は可視 input のため `clickAndExpectChange(#mi-run, ...)` の流れで対応可能(`#mi-run` クリックで `runMasterImport()` 発火、ファイルと貼付の排他制御は production code 側で実施)
  - 異常系(両方指定エラー / 両方空エラー)は §5.2 サンプル e2e の対象外(Stage 2b 仕様で扱う)

#### confirm-gated P0 操作一覧 + dialog handling 標準形(v1.4 で追加、Codex SF#1 反映)

`shogi_v4.html` の実体確認(Claude Code 調査)により、以下 4 操作は **production code 側で `confirm()` / `alert()` ダイアログを発火** することが判明した。Stage 2a で factory レベル対応するのは `stateLoadedFromFile`(#20)のみ。残り 3 件(#17 `masterImported`(overwrite モード時) / #19 `stateLoaded` / #21 `stateReset`)は **Stage 2a テスト側責任**(テスト書き手が `page.on('dialog')` を仕込む) として §10.4 Stage 2b 申し送り時に正式化。

| factory # | 対応 production 関数 | confirm | alert | 非同期 | 初期 disabled | Stage 2a での対応 |
|---|---|---|---|---|---|---|
| #17 `masterImported` | `runMasterImport()`(overwrite モード時のみ) | ✅1 | ❌ | ✅ FileReader(file 経由時) | ❌ | テスト側責任(Stage 2b で factory 化を Stage 2b 仕様で正式化) |
| #19 `stateLoaded` | `loadFromPaste()` | ✅1 | ✅1(成功時 + catch 時) | ❌ | ✅(`#load-paste-area` 入力で enable) | テスト側責任(Stage 2b で factory 化) |
| #20 `stateLoadedFromFile` | `loadData()` | ✅1 | ✅1(成功時 + catch 時) | ✅ FileReader.onload | ❌ | **factory レベル対応**(§4.3 #20、`beforeClick` で dialog auto-accept 設定 + `afterClick` で `waitForFunction` 反映待ち) |
| #21 `stateReset` | `resetAll()` | ✅1 | ❌(`showMsg` は DOM 内バナー、`page.on('dialog')` 対象外) | ❌ | ❌ | テスト側責任(Stage 2b で factory 化) |

**dialog handling 標準形**(Stage 2a テスト書き手 + 将来の factory が共通利用):

```javascript
// 標準パターン: factory.beforeClick or テスト側 beforeAll で実行
async function setupDialogAutoAccept(page, expectedTypes = ['confirm']) {
  const captured = [];
  page.on('dialog', async (dialog) => {
    captured.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  return captured;  // 後で件数 / 種別を assertion で確認可能
}

// 使用例(stateLoadedFromFile 用、§4.3 #20 で factory 内部に組込)
beforeClick: async (page) => {
  page.on('dialog', async (dialog) => {
    await dialog.accept();  // confirm + alert を計 2 回受諾
  });
}

// stateLoaded / stateReset / masterImported(overwrite) 用(Stage 2a テスト側責任)
test('stateLoaded サンプル', async ({ page }) => {
  page.on('dialog', async (dialog) => await dialog.accept());
  await page.locator('#load-paste-area').fill(JSON.stringify(sampleState));
  await clickAndExpectChange(
    page.locator('#load-from-paste'),
    shogiAssertions.stateLoaded(1, 0)
  );
});
```

**非同期完了待ち標準形**(`stateLoadedFromFile` 等の `FileReader.onload` 系):

```javascript
afterClick: async (page) => {
  await page.waitForFunction(
    () => window.state && (window.state.players.A.length > 0 || window.state.players.B.length > 0),
    { timeout: 1000 }
  );
}
```

**判定ルール**: primary assertion の責務が変わる(例: `tournamentStarted` の primary 種別が `state+tab` から `state` のみに縮小される)場合は v1.4 仕様書更新対象とする。grep 微調整では済まない。実装着手時に責務の変更が必要と判断された場合、Stage 2a 実装を一旦止めて Claude.ai に v1.4 起草を依頼する。

### 3.5 新規操作追加ルール(A-T spec v1.3 §4.3.8 から転記、v1.3 でファイル系判定追加)

A-7 / A-8 / A-9 等で新規 click 操作を追加する場合:

1. **`shogi_assertions.js` に factory を追加**(カタログにない操作のテストを書くことを禁止)
2. **factory の `meta.operation` フィールドに業務目的を 1 文で記載**
3. **`meta.primaryAssertions >= 1` を保証**(state / DOM / 永続化 / URL / spy のいずれか)
4. **L0 §1.5 P0 に該当する場合、通知表示のみを成功条件にしない**
5. **既存カテゴリに当てはまらない場合、Stage 着手前に ChatGPT / Codex レビューへ回す**
6. **ファイル input 型操作の場合**(v1.3 で追加):`triggerInputFileAndExpectChange` を使用、`clickAndExpectChange` では扱わない。判定基準は「対象セレクタが `<input type="file">` か」「ブラウザのファイル選択ダイアログを開く操作か」のいずれか

判定責任:
- **業務目的整理**:Claude.ai(仕様書段階)
- **primary assertion の妥当性確認**:ChatGPT メタレビュー
- **factory 反映と実装**:Claude Code(Stage 着手時)
- **PR レビューでの抜け検出**:Codex(v1.2.5 §13.4 YAML)
- **使用ヘルパの判定**(v1.3 追加):Claude.ai(仕様書段階で判断、迷ったら Codex 独立レビューに委ねる)

### 3.6 P0/P1/P2 の Stage 適用範囲(SF #3 吸収、L0 §1.5 と接続)

L0 §1.5 で P0/P1/P2 に分類された 33 操作の Stage 別扱い:

| 優先度 | 操作数 | Stage 2a 扱い | Stage 2b 扱い | Stage 2c 扱い |
|---|---|---|---|---|
| P0(業務停止・データ破壊) | 19 操作(分割で 22 factory) | **カタログ完備必須**(§3.4)、clipboard/print/file 系も含む(v1.1 で API 拡張により対応、v1.3 でファイル系は別ヘルパ分離) | A-4.2 関連を `clickAndExpectChange` / `triggerInputFileAndExpectChange` で置換 | 残り P0 を全置換 |
| P1(表示状態・モーダル) | 11 操作 | factory 列挙のみ(後段の起点) | DOM 表示変化 assertion を原則必須で置換 | - |
| P2(印刷 / ファイル選択 / クリップボード) | 0 操作(v1.1 で P0 に統合、v1.3 でヘルパ分離) | - | - | - |

**v1.1 注**:v1 では P2 を Stage 2c 送りとしていたが、Must Fix #2 解決の API 拡張により P0 内に統合。L0 §1.5 P2 区分は「自動検証困難」という意味で残しつつ、Stage 2a 実装としては P0 と同列に扱う。

#### v1.2 補足(SF#6 反映、L0 §1.5 P2 概念との関係明文化)

業務優先度(L0 §1.5、変更なし):

- 印刷・ファイル選択・クリップボード操作は **業務優先度として P2** に分類されたまま
- これは「業務上の優先度(破壊性・業務停止リスク)」での分類
- L0 §1.5 の P2 区分は維持(v1.2 / v1.3 では L0 を変更しない)

Stage 2a 検証実装範囲(本仕様書の取扱):

- v1.1 の API 拡張(`beforeClick/afterClick`、`requiredPermissions`、spy 注入)により、本来 P2 分類の操作も P0 と同列に factory 化して検証可能
- v1.3 でファイル系は `triggerInputFileAndExpectChange` ヘルパに分離(`clickAndExpectChange` の枠を構造的に外す)
- Stage 2a 実装範囲としては P0 カタログに統合(§3.4 #18 / #20 / #22)
- §3.6 表の「P2 = 0 操作」は Stage 2a 検証実装範囲上の統合を示すものであり、L0 業務優先度上の分類変更ではない

結論:

- L0 §1.5 P2 区分は維持(変更なし)
- Stage 2a 検証実装は P0 と同列に処理(API 拡張 + ヘルパ分離で対応可能となったため)
- 将来 L0 を更新する際、この統合方針が変わる場合は L0 を先に更新する

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

### 4.1 ファイル配置(v1.3 で `triggerInputFileAndExpectChange.js` + `getStateSnapshot.js` 分離追加)

```
test/
  helpers/
    expectClickable.js                    # 新規(§3.1、v1.3 で scrollIntoViewIfNeeded 復活 + hit-test コメント)
    getStateSnapshot.js                   # 新規(v1.3 で clickAndExpectChange.js から分離、両ヘルパ共通利用、v1.5 で localStorage 個別 try/catch)
    clickAndExpectChange.js               # 新規(§3.2、標準クリック型専用)
    triggerInputFileAndExpectChange.js    # 新規(§3.2.5、v1.3 で新設、ファイル input 型専用)
    stableStringify.js                    # 新規(§3.7、NH#3)
    shogi_assertions.js                   # 新規(§4.3、22 factory)
    expectClickable.test.js               # 新規(§5.1)
    clickAndExpectChange.test.js          # 新規(§5.1)
    triggerInputFileAndExpectChange.test.js  # 新規(§5.1、v1.3 で追加)
    getStateSnapshot.test.js              # 新規(§5.1、v1.3 で追加)
    stableStringify.test.js               # 新規(§5.1)
    shogi_assertions.test.js              # 新規(§5.1)
  e2e/
    sample/
      at_stage_2a_sanity.spec.js          # 新規(§5.2、v1.3 で raw click 排除 + ファイル系正常系追加)
```

### 4.2 命名規則

- factory 名は **camelCase**、業務目的を表す動詞句(`participantAdded`, `tournamentStarted`)
- ヘルパファイル名は **camelCase**(`expectClickable.js`, `triggerInputFileAndExpectChange.js`)
- テストファイルは `<src>.test.js` または `<feature>.spec.js`

### 4.3 `shogi_assertions.js` の構造(v1.1 で factory 形式に再設計、v1.2 で typedef 追加、v1.3 で stateLoadedFromFile 再設計)

```javascript
// test/helpers/shogi_assertions.js
const { expect } = require('@playwright/test');
const { expectStateChanged } = require('./stableStringify');

/**
 * @typedef {Object} ExpectedChangeFactory
 *   `clickAndExpectChange` / `triggerInputFileAndExpectChange` に渡す factory の戻り値型。
 *   両ヘルパ共通で使用(v1.3、`triggerInputFileAndExpectChange` 新設後)。
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
 *
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [beforeClick]
 *   クリック前(`triggerInputFileAndExpectChange` の場合は setInputFiles 前)の setup。
 *   spy 注入、ファイル選択ダイアログ受諾、permission 関連の sanity check 等。
 *
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [afterClick]
 *   クリック後(`triggerInputFileAndExpectChange` の場合は setInputFiles 後)の teardown。
 *   非同期 change handler の完了待ち等。
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

  // #9 ラウンド確定(SF#2 反映、isFinal 自動判定は §10 Stage 2b 申し送り)
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

  // #10 ペアリング再生成(SF#3 反映、運用ルールは §10 Stage 2b 申し送り)
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

  // #17 マスタインポート実行(SF#4 反映、v1.3 で実装時確認要件を §3.4 末尾に追記)
  masterImported: (options = {}) => ({
    assertion: async (before, after, page) => {
      const { expectedNewCount = 0, existingMemberIds = [], tombstoneOrIds = [] } = options;
      expect(after.master.members.length).toBe(before.master.members.length + expectedNewCount);
      for (const id of existingMemberIds) {
        const beforeMember = before.master.members.find(m => m.id === id);
        const afterMember = after.master.members.find(m => m.id === id);
        expect(afterMember.name).toBe(beforeMember.name);
        expect(afterMember.yomi).toBe(beforeMember.yomi);
      }
      for (const id of tombstoneOrIds) {
        const member = after.master.members.find(m => m.id === id);
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
  // v1.5 反映(Stage 2a 実装で発覚): saveData() は navigator.clipboard.writeText().then(() => alert(...)) の
  // 非同期構造。beforeClick で alert auto-accept、assertion で clipboard polling 待ち。
  // また syncBranchMasterOnSave() が新規 player に member_id を補完する production mutation あり、
  // 比較対象は before.state.players ではなく after.state.players(保存後の state と clipboard の一致)。
  tournamentDataCopied: () => ({
    beforeClick: async (page) => {
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
    },
    assertion: async (before, after, page) => {
      // saveData() の writeText().then(alert) 非同期反映を polling 待ち(最大 2 秒、50ms × 40 回)
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
      // syncBranchMasterOnSave() が新規 player に member_id を補完する production mutation のため
      // 比較対象は after.state.players(保存後の state と clipboard の一致を検証)
      expect(parsed.players).toEqual(after.state.players);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['clipboard'],
      operation: 'tournamentDataCopied',
      description: '大会データをクリップボードにコピー(saveData() 非同期 + master 同期 mutation 対応)',
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

  // #20 読み込み実行(ファイル) - v1.4 で実体接続反映(Codex v1.3 → v1.4 MF#1)
  // 使用ヘルパ: triggerInputFileAndExpectChange
  // 対象: #loadFile(隠し file input、L94)
  // 仲介 button(#load-pick-file)は使わない
  // 実体: loadData(e) は confirm('現在のデータを上書きして読み込みますか？') → FileReader.onload(非同期) → applyLoadedJson + alert('データを読み込みました') の 3 段
  stateLoadedFromFile: (expectedPlayersA, expectedPlayersB) => ({
    assertion: async (before, after, page) => {
      expectStateChanged(before, after, 'state');
      if (expectedPlayersA != null) expect(after.state.players.A.length).toBe(expectedPlayersA);
      if (expectedPlayersB != null) expect(after.state.players.B.length).toBe(expectedPlayersB);
    },
    // v1.4: beforeClick で dialog auto-accept(confirm + alert を計 2 回受諾)
    beforeClick: async (page) => {
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
    },
    // v1.4: afterClick で FileReader.onload 非同期完了 + state 反映を待つ
    afterClick: async (page) => {
      await page.waitForFunction(
        (expA, expB) => {
          if (!window.state) return false;
          if (expA != null && window.state.players.A.length !== expA) return false;
          if (expB != null && window.state.players.B.length !== expB) return false;
          return window.state.players.A.length > 0 || window.state.players.B.length > 0;
        },
        expectedPlayersA, expectedPlayersB,
        { timeout: 2000 }
      );
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state', 'localStorage'],
      operation: 'stateLoadedFromFile',
      description: 'ファイルから state を復元(triggerInputFileAndExpectChange で setInputFiles + dialog auto-accept + FileReader.onload 完了待ち)',
    },
  }),

  // #21 リセット(master 不変が重要)
  stateReset: () => ({
    assertion: async (before, after, page) => {
      expect(after.state.players.A.length).toBe(0);
      expect(after.state.players.B.length).toBe(0);
      expect(after.state.started).toBe(false);
      expect(after.localStorage.shogi_v4).toBeNull();
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
| #1 報告書 assertion 統一 | §3.4 #22 + §4.3 `reportDownloaded` |
| #2 pairings/results 用語整理 | §3.4 #9/#10/#12 + §4.3 各 assertion |
| #3 P0/P1/P2 Stage 適用範囲 | §3.6 表(v1.1 で P2 を P0 に統合) |

### 4.5 ChatGPT v1.0 → v1.1 Stage 2a 仕様書レビュー指摘の吸収

(v1.2 から踏襲、変更なし)

### 4.6 ChatGPT v1.1 → v1.2 再レビュー指摘の吸収

(v1.2 で確定、変更なし。SF#1〜#3, #6, NH#3, 回帰懸念 3 件を v1.2 で吸収済み、SF#4/#5 は §10 Stage 2b 申し送り)

### 4.7 Codex v1.2 → v1.3 独立レビュー指摘の吸収(本 v1.3 で吸収)

| 指摘 | 吸収箇所 | 対応内容 |
|---|---|---|
| **Must Fix #1** §5.2 clipboard サンプル e2e の raw `#addBtn.click()` | §5.2 サンプル e2e | 事前準備の `await page.locator('#addBtn').click()` を `await clickAndExpectChange(page.locator('#addBtn'), shogiAssertions.participantAdded('A'))` に修正。Stage 1 で問題視された「クリック前検証不在」をサンプル内に再導入しない構造に |
| **Must Fix #2** `stateLoadedFromFile` factory の selector / change handler 不整合 | §3.2.5 新設 + §4.3 #20 再設計 + §3.4 表 #20 注記更新 + §4.1 ファイル配置追加 + §5.1 単体テスト追加 + §5.2 ファイル系 e2e 追加 + §6 完了基準追加 | `triggerInputFileAndExpectChange` ヘルパを新設、`#loadFile`(隠し file input、L94)を直接ターゲット、`setInputFiles` 直接実行で change イベント発火、`expectClickable` をスキップ。仲介 button `#load-pick-file` は使わない |
| **Should Fix #1** `expectClickable` に `scrollIntoViewIfNeeded()` 復活 | §3.1 段階 0(新設) | viewport 外要素の hit-test 失敗を防ぐため、段階 1〜6 の前に `scrollIntoViewIfNeeded()` を呼ぶ。A-T spec v1.3 §4.2 + DevSecOps v1.2.5 L4 整合 |
| **Should Fix #2** hit-test の `top.contains(el)` 許容を狭める | §3.1 段階 6 | `top === el || el.contains(top) || top.contains(el)` から `top === el || el.contains(top)` に変更(祖先許容を削除)。コメントで判断理由を明記 |
| **Should Fix #3** Codex YAML の `raw_callback_usage_count` 内訳分離 | §6 Codex Yes YAML | `raw_callback_usage_count: 3` を `raw_callback_usage: { helper_unit: N, sample_negative: N, p0_e2e: 0 }` に内訳化、Stage 2c で機械判定しやすく |
| **Nice to Have #1** `stateLoadedFromFile` を file input 型 helper として別 API に | §3.2.5 新設で対応(Codex MF#2 と統合的に解決) | `triggerInputFileAndExpectChange` 新設により、クリック型と file input 型の責務が API レベルで分離 |
| **Nice to Have #2** `requiredPermissions` を持つ factory の §6 YAML 配列化 | §6 Codex Yes YAML | `factory_with_required_permissions: ['tournamentDataCopied']` を追加、後続レビューで一覧確認が容易に |

#### v1.3 で扱わなかった項目(Stage 2b 以降の検討対象)

- **`masterImported` の confirm 受諾 / mi-mode ラジオ設定 / 異常系**(両方指定エラー / 両方空エラー):§3.4 末尾の「実装時確認可」に注記、Stage 2b 仕様書で正式化。Stage 2a ではテスト側責任として実装可能(`page.on('dialog')` + ラジオ check)
- **回帰懸念 (v1.3)**: API 数増加(`clickAndExpectChange` + `triggerInputFileAndExpectChange` の使い分け)による Stage 2a 実装難度上昇 → §8 リスクと緩和に追記、判断基準を §3.4 表「ヘルパ」列で機械化済み

### 4.8 Codex v1.3 → v1.4 独立再レビュー指摘の吸収(本 v1.4 で吸収)

| 指摘 | 吸収箇所(v1.4) | 対応内容 |
|---|---|---|
| **Must Fix #1** `stateLoadedFromFile` の confirm + FileReader 非同期 + alert 実体接続の浅さ | §4.3 #20 + §3.4 表 #20 注記 + §5.2 サンプル e2e + §8 リスク行 | factory に `beforeClick`(dialog auto-accept で confirm + alert 受諾)+ `afterClick`(`page.waitForFunction` で `FileReader.onload` 完了 + state 反映待ち)追加。`description` を実体に合わせて更新。サンプル e2e に dialog handler + waitForFunction の実コード反映 |
| **Must Fix #2** §3.4 表 #20 と §4.3 #20 の factory 署名不整合 | §3.4 表 #20 注記 | `stateLoadedFromFile(filePath, expectedPlayersA, expectedPlayersB)` を `stateLoadedFromFile(expectedPlayersA, expectedPlayersB)` に修正(`filePath` は `triggerInputFileAndExpectChange` 引数のため factory から削除、コードと整合) |
| **Should Fix #1** confirm-gated P0 操作一覧 + dialog handling 標準形を §3.4 末尾か §3.5 に明記 | §3.4 末尾「confirm-gated P0 操作一覧 + dialog handling 標準形」(新規ブロック) | 4 操作(#17 `masterImported`(overwrite モード時) / #19 `stateLoaded` / #20 `stateLoadedFromFile` / #21 `stateReset`)の confirm/alert/非同期/disabled の有無を表で明記。`setupDialogAutoAccept` 標準パターン + `waitForFunction` 非同期完了待ち標準形をコード例で明示。Stage 2a で factory レベル対応するのは `stateLoadedFromFile`(#20)のみ、残り 3 件はテスト側責任 + §10.4 Stage 2b 申し送り |
| **Should Fix #2** §8 リスク行「現実装は同期」が実体と逆 | §8 リスク表の `triggerInputFileAndExpectChange` 行 | 「現実装は同期」を「現実装は `FileReader.onload` で非同期、`waitForFunction` で完了待ち」に修正 |
| **Nice to Have #1** §0 対象ブランチ行を db8d5ab に更新 | §0 ヘッダー | 「現 HEAD d6832af」を「現 HEAD 0c96cb2 = v1.3 用 Codex 再レビュー依頼追加」に更新 |
| **Nice to Have #2** サンプル e2e で「confirm accept → FileReader 完了 → alert accept → UI 反映」までの実コード提示 | §5.2 サンプル e2e の `stateLoadedFromFile` 正常系 | dialog handler + waitForFunction + UI 反映補助 assertion の実コードを反映、Stage 2b 担当 AI の見本として強化 |

#### v1.4 で扱わなかった項目(Stage 2b 申し送り、§10.4 で正式化)

- stateLoaded(#19) / stateReset(#21) / masterImported(#17 overwrite モード時 + file 経由時) の **factory レベル dialog 対応**: Stage 2a では §3.4 末尾の「Stage 2a テスト側責任」として明記、Stage 2b 仕様書で factory に `beforeClick` 内蔵を正式化(§10.4)
- meta フィールド拡張(`dialogCount` / `dialogTypes` / `asyncWait` / `requiresFillBeforeEnable`)による構造化: Stage 2a 範囲では過剰(Codex も提案レベル)、Stage 2b 仕様書で必要性を再評価

### 4.9 Stage 2a 実装(commit 7afd060)→ v1.5 spec 同期マトリクス

Stage 2a 実装(全 438 件緑)で発覚した spec 見落とし 5 件を v1.5 で正式反映:

| # | 調整内容 | 反映箇所(v1.5) | 性質 |
|---|---|---|---|
| 1 | `expectClickable` 段階 0 `scrollIntoViewIfNeeded` に `timeout=1000` + try/catch | §3.1 段階 0 コメント + コード | display:none 要素で auto-wait が hang し段階 1 toBeVisible に到達しない問題への対応(spec で予測できなかった環境問題) |
| 2 | `expectClickable` 段階 6 hit-test の `inset` を `max(2, ceil(br * 0.35))` 動的計算 | §3.1 段階 4 styles に `borderRadius` 追加 + 段階 6 hit-test inset 計算 | spec の固定 `inset=2` が border-radius >= 4px の要素で角座標を親要素にヒットさせる(実 shogi_v4.html の button が `border-radius: 8px`)、円弧 (1 - 1/√2) ≈ 0.293 のため 0.35 倍で角が要素内部に確実に入る |
| 3 | `getStateSnapshot.js` の localStorage アクセスを各キー個別に try/catch | §4.1 ファイル配置注記 | about:blank / page.setContent ページでの SecurityError は spec で予測できず、helper 単体テスト用途で null フォールバック必要 |
| 4 | `tournamentDataCopied` factory に `beforeClick`(alert auto-accept)+ assertion 内で clipboard polling 待ち | §4.3 #18 | `saveData()` の `navigator.clipboard.writeText().then(() => alert(...))` 非同期構造を spec で見落とし(Codex MF#1 同系統) |
| 5 | `tournamentDataCopied` assertion の比較対象を `before.state.players` → `after.state.players` | §4.3 #18 | `syncBranchMasterOnSave()` が新規 player に member_id を補完する production mutation の事実を spec で見落とし |

#### v1.5 で扱わなかった項目(Stage 2b 申し送り、§10.5 で正式化)

- 他 factory(#19 stateLoaded / #21 stateReset / #22 reportDownloaded 等)での同種パターン(非同期 + DOM mutation)再発の可能性: Stage 2b 置換時に発覚したら同じパターンで対応(beforeClick で dialog accept、assertion で polling、比較対象を after.state にする)、§10.5 で再発リスクと対応手順を明記

---

## 5. テスト計画

### 5.1 ヘルパ単体テスト

#### `expectClickable.test.js`(v1.3 で SF#1 / SF#2 反映)

A-T spec v1.3 §4.2 各段階の正常系・異常系を網羅。特に:
- 物理的不在/不可視/無効化で赤(段階 1)
- `pointer-events: none` / `opacity: 0.3` で赤(段階 4)
- 祖先 `display: none` / `inert` で赤(段階 5)
- 中央点が overlay でブロックされる場合に赤(段階 6)
- 角の点がブロックされる場合に赤(段階 6)
- **祖先要素が hit-test で top に来る場合に赤**(v1.3 SF#2、`top.contains(el)` 許容削除の検証)
- **viewport 外の要素が `scrollIntoViewIfNeeded` で可視化される**(v1.3 SF#1 復活)
- 全条件クリアで緑
- 小要素(width<4px)で中央 1 点のみ評価される(NH#2 検証)

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

#### `triggerInputFileAndExpectChange.test.js`(v1.3 で新設、Codex MF#2 連動、5 件以上必須)

| テスト名 | 期待動作 |
|---|---|
| factory 戻り値 + setInputFiles 成功で緑 | 通常 success(file input の change イベントで state 変化、primary assertion 緑) |
| factory 戻り値 + meta.primaryAssertions=0 で赤 | `primary semantic assertion is required` でエラー |
| **対象が `<input type="file">` でない場合に赤** | `triggerInputFileAndExpectChange: locator must be <input type="file">` でエラー(段階 1 検証) |
| raw callback + ctx.primary() 1 回呼出で緑 | 通常 success(file input + raw callback 形式の動作確認) |
| raw callback + ctx.primary() 0 回呼出で赤 | 同上のエラー |
| **`expectClickable` がスキップされ、`display:none` の file input でも緑** | 段階 1〜6 検証なしで setInputFiles が成功(構造的特殊性の検証) |
| factory の `beforeClick` / `afterClick` が呼ばれる | spy で実行順序を検証(setInputFiles 前後で発火) |
| `options.beforeSetFiles` / `options.afterSetFiles` が順序通り実行される | 同上(option の専用名で動作) |

#### `getStateSnapshot.test.js`(v1.3 で新設、3 件以上必須)

| テスト名 | 期待動作 |
|---|---|
| state / master / localStorage / url / activeTab を返す | L0 §4.1 の全キーを取得 |
| `options.selectors` が指定された場合、dom フィールドが追加される(NH#1) | DOM query 結果が `before.dom.{key}` で取得可能 |
| state が null の場合(初期状態)、null を返す | エラーにならず null を返す |

#### `shogi_assertions.test.js`(全 22 factory の meta 検証)

各 factory に対して:
- `meta.primaryAssertions >= 1` を保証
- `meta.operation` が一意の文字列
- `meta.primaryTypes` が定義された値
- 必要な factory(`reportDownloaded`)に `beforeClick` が存在
- **`tournamentDataCopied` の `meta.requiredPermissions` が `['clipboard-read', 'clipboard-write']` を含む**(v1.2 で SF#2 反映)
- **`stateLoadedFromFile` の使用ヘルパが `triggerInputFileAndExpectChange` であることをコメントで明示**(v1.3 で追加、§3.4 表との整合)

### 5.2 サンプル e2e テスト(Should Fix #6 反映、v1.3 で raw click 排除 + ファイル系正常系追加)

`test/e2e/sample/at_stage_2a_sanity.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../../helpers/clickAndExpectChange');
const { triggerInputFileAndExpectChange } = require('../../helpers/triggerInputFileAndExpectChange');
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

    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });

  test('異常系: primary assertion 0 件の expectedChange は必ず赤になる', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    await page.locator('#inp-name').fill('テスト 次郎');
    await page.locator('#inp-yomi').fill('テスト ジロウ');
    await page.locator('#inp-class').selectOption('A');

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
          await expect(page.locator('#reg-msg')).toBeVisible();
        }
      );
    } catch (e) {
      errorCaught = e;
    }
    expect(errorCaught, '通知のみ確認では必ずエラーになるべき').not.toBeNull();
    expect(errorCaught.message).toMatch(/primary semantic assertion is required/);
  });

  test('正常系: 大会データコピーが clipboard primary で緑になる(v1.2 SF#2、v1.3 で事前準備の raw click 排除)', async ({ page, context }) => {
    // SF#2: meta.requiredPermissions の実態保証
    const factory = shogiAssertions.tournamentDataCopied();
    const requiredPermissions = factory.meta.requiredPermissions || [];
    if (requiredPermissions.length > 0) {
      await context.grantPermissions(requiredPermissions);
    }

    await page.goto('/shogi_v4.html');
    // v1.3 Codex MF#1 反映: 事前準備も clickAndExpectChange 経由で実施(raw click 排除)
    await page.locator('#inp-name').fill('テスト 四郎');
    await page.locator('#inp-yomi').fill('テスト シロウ');
    await page.locator('#inp-class').selectOption('A');
    await clickAndExpectChange(
      page.locator('#addBtn'),
      shogiAssertions.participantAdded('A')
    );

    // 本検証: tournamentDataCopied
    await clickAndExpectChange(
      page.locator('#saveBtn'),
      factory
    );

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test('正常系: ファイル読込が triggerInputFileAndExpectChange で緑になる(v1.3 → v1.4、Codex MF#1/#2 実態保証)', async ({ page }, testInfo) => {
    // v1.4 Codex MF#1 反映: stateLoadedFromFile factory が beforeClick で dialog auto-accept、
    //                        afterClick で FileReader.onload 完了 + state 反映を waitForFunction で待つ
    //                        テスト側はこの factory を渡すだけで confirm + FileReader + alert の 3 段に対応できる
    // v1.3 Codex MF#2 反映: #loadFile(隠し file input、L94)を直接ターゲット、setInputFiles 直接実行
    await page.goto('/shogi_v4.html');

    // 事前準備: テスト用の state JSON ファイルを生成
    const sampleState = {
      players: { A: [{ name: 'ファイル太郎', yomi: 'ファイルタロウ', cls: 'A' }], B: [] },
      pairings: { A: [], B: [] },
      results: { A: [], B: [] },
      started: false,
      rounds: 3,
    };
    const tmpFilePath = testInfo.outputPath('sample_state.json');
    require('fs').writeFileSync(tmpFilePath, JSON.stringify(sampleState));

    // triggerInputFileAndExpectChange + factory が以下を一手に処理:
    //   1. setInputFiles(#loadFile, filePath) → change イベント発火 → loadData(e) 呼出
    //   2. factory.beforeClick: page.on('dialog') で confirm/alert を計 2 回 auto-accept
    //   3. confirm 受諾 → FileReader.readAsText 開始(非同期)
    //   4. FileReader.onload で applyLoadedJson(state 復元、同期)
    //   5. alert('データを読み込みました') → auto-accept
    //   6. factory.afterClick: page.waitForFunction で state.players 反映を待つ
    //   7. assertion: state 変化 + expectedPlayersA/B 件数を検証
    await triggerInputFileAndExpectChange(
      page.locator('#loadFile'),
      tmpFilePath,
      shogiAssertions.stateLoadedFromFile(1, 0)  // expectedPlayersA=1, expectedPlayersB=0
    );

    // 補助 assertion: UI 反映を確認(player-row が表示されている、modal が閉じている等)
    await expect(page.locator('#a-list .player-row')).toHaveCount(1);
  });

});
```

---

## 6. 完了基準

A-T spec v1.3 §Stage 2a 完了基準準拠 + 本仕様書 v1.3 追加項目:

- ✅ `expectClickable` ヘルパが §3.1 の 8 段階検証(段階 0 = scrollIntoViewIfNeeded、段階 1〜7)すべてを実装(NH#2 小要素対応 + v1.3 SF#1/#2 反映含む)
- ✅ `clickAndExpectChange` ヘルパが §3.2 の API(factory + ctx 併存、options.beforeClick/afterClick、page 引数)を実装、ファイル input 型は受け付けない
- ✅ **`triggerInputFileAndExpectChange` ヘルパが §3.2.5 の API(factory + ctx 併存、options.beforeSetFiles/afterSetFiles、setInputFiles 直接実行、expectClickable スキップ)を実装**(v1.3、Codex MF#2)
- ✅ `getStateSnapshot` が L0 §4.1 の 3 LocalStorage キー + state + master + url + activeTab を取得、NH#1 DOM query option 対応、v1.3 で別ファイルに分離して両ヘルパから共通利用
- ✅ `stableStringify` + `expectStateChanged/Unchanged` ヘルパ実装(§3.7、NH#3、循環参照非対応の明記含む)
- ✅ `shogi_assertions.js` に §3.4 の 22 factory が完備、全 factory が `meta.primaryAssertions >= 1` を持つ
- ✅ `shogi_assertions.js` 冒頭に `ExpectedChangeFactory` typedef が JSDoc 形式で記載(NH#3)、`clickAndExpectChange.js` + `triggerInputFileAndExpectChange.js` 冒頭から参照
- ✅ §3.5 新規操作追加ルールが仕様書に明記(v1.3 でファイル系判定追加)
- ✅ ヘルパ単体テスト(§5.1):合計 35 件以上、全件緑(v1.3 で `triggerInputFileAndExpectChange.test.js` 5 件以上 + `getStateSnapshot.test.js` 3 件以上を追加、+8 件)
- ✅ **`primaryAssertions=0` の expectedChange を渡すと必ず赤になる単体テスト + e2e テストが緑(SF#7 連動、両ヘルパで検証)**
- ✅ **`tournamentDataCopied` の `meta.requiredPermissions = ['clipboard-read', 'clipboard-write']` 検証が単体テストで緑**(v1.2、SF#2 反映)
- ✅ **`meta.requiredPermissions` を持つ factory(v1.3 時点で `tournamentDataCopied` のみ)について、サンプル e2e で `context.grantPermissions(meta.requiredPermissions)` を実行し、`navigator.clipboard.readText()` が実際に成功することを検証**(v1.2、SF#2 実態保証)
- ✅ **`stateLoadedFromFile` factory の `triggerInputFileAndExpectChange` 経由実行(`#loadFile` 直接ターゲット、`setInputFiles` 直接実行)を §5.2 サンプル e2e で正常系 1 件検証**(v1.3、Codex v1.2 MF#2 実態保証)。**v1.4 で `factory.beforeClick`(dialog auto-accept で confirm + alert 受諾)+ `factory.afterClick`(`page.waitForFunction` で `FileReader.onload` 完了 + state 反映待ち)が組み込まれていることを単体テスト + サンプル e2e で検証**(Codex v1.3 MF#1 実体接続反映)
- ✅ サンプル e2e テスト(§5.2):正常系 3 件 + 異常系 2 件、計 5 件全件緑(v1.3 で clipboard 系の事前準備 raw click 排除 + ファイル系 1 件追加、異常系は「赤になることを期待」して try/catch で緑)
- ✅ **§5.2 サンプル e2e 内に `await page.locator(...).click()` の raw click 呼出がゼロ**(v1.3、Codex MF#1 反映、grep 検証)
- ✅ リポジトリ全体の `force: true` 使用箇所がゼロ(grep 検証、Stage 1 で既達確認済み)
- ✅ 既存 e2e 124 テスト(130 click)に影響なし(全件緑のまま)
- ✅ **L0 §1.5 P0 e2e で raw callback 形式の使用箇所がゼロ**(grep 検証、v1.2、SF#1 反映、Stage 2b 以降の置換時にも維持)
- ✅ Codex フェーズ境界レビュー A 以上(v1.3 で B+ → 修正後 A 判定狙い)

### Codex Yes YAML 仮定義(NH#4、v1.3 で内訳分離 + factory 一覧追加、Stage 2c で正式化)

```yaml
codex_l4_review:
  expect_clickable_helper_exists: true
  click_and_expect_change_helper_exists: true
  trigger_input_file_and_expect_change_helper_exists: true   # v1.3 追加
  primary_assertion_enforced_machine: true
  primary_assertion_zero_case_fails: true
  shogi_assertion_factory_count: 22
  all_factories_have_meta_primary_count: true
  factory_clipboard_print_supported: true
  factory_file_input_supported: true                          # v1.3 追加(triggerInputFileAndExpectChange)
  options_beforeclick_afterclick_supported: true
  options_beforesetfiles_aftersetfiles_supported: true        # v1.3 追加
  force_true_in_helpers: 0
  sample_e2e_green: true
  sample_e2e_negative_assertion_works: true
  sample_e2e_raw_click_count: 0                               # v1.3 追加(Codex MF#1)

  # v1.2 追加
  factory_required_permissions_validated: true
  expected_change_factory_typedef_exists: true

  # v1.2 → v1.3 で内訳化(Codex SF#3)
  raw_callback_usage:
    helper_unit: 4         # helper 単体テスト内(clickAndExpectChange.test.js + triggerInputFileAndExpectChange.test.js の raw callback ケース合計)
    sample_negative: 2     # サンプル e2e の異常系 2 件
    p0_e2e: 0              # P0 e2e で 0 を維持(Stage 2a 完了基準)

  # v1.3 追加(Codex NH#2)
  factory_with_required_permissions:
    - tournamentDataCopied
  factory_with_trigger_input_file:
    - stateLoadedFromFile

  verdict: "Yes"
```

`raw_callback_usage.p0_e2e` の閾値は `0` を維持(Stage 2c で正式化)。`sample_negative` / `helper_unit` 以外でカウントが増えた場合は ChatGPT/Codex 重点確認。

---

## 7. 受け入れ基準

- 本仕様書(v1.5)が Codex 独立 Gate Review A 以上(Stage 2a 実装→spec 同期 5 件 + 既存 P0/raw click ゼロ/force:true ゼロ/factory 使用/代表 e2e 5 観点)
- 本仕様書(v1.4)が Codex 独立 Quick Review A 判定済み(commit edca3e5、参考情報)
- Stage 2a 実装(commit 7afd060)が全 438 件緑(完了基準 §6 全項目達成)
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
| API 高機能化(v1.1 拡張)で Stage 2a 実装難度上昇(回帰懸念 #1) | テスト書きにくさ・実装工数増 | factory 形式を Stage 2a 標準とする(§3.2 末尾ガイドライン)、helper 単体テスト → state 系 factory → clipboard/file/print 系の順で段階実装、Codex YAML で進捗観測 |
| Stage 2a 範囲拡大(v1.1 で P2 を P0 統合)(回帰懸念 #2) | Stage 2a 工数増 | Stage 2a 完了条件は「P0 22 factory + 単体テスト + サンプル e2e 5 件」に限定(§6)、既存 spec 置換は Stage 2b 以降、clipboard/file/print 系は §4.3 で専用ブロックとして分離実装 |
| raw callback 形式の悪用余地(回帰懸念 #3、`ctx.primary()` 形式的呼出し) | 形式的 primary が再発、A-4.2 型バグ再発 | §3.2 末尾 raw callback ガイドライン(P0 は factory 必須、`ctx.primary()` 直後に `expect(...)` 必須)、Codex YAML で `raw_callback_usage` 内訳観測(v1.3)、ChatGPT/Codex 独立レビューで P0 e2e の raw callback 使用箇所を重点確認 |
| **API 数増加(v1.3 で `triggerInputFileAndExpectChange` 追加)で利用者がヘルパ選択を誤る**(v1.3 回帰懸念) | クリック型と file input 型の使い分けミスでテスト書きにくさ・誤った API 使用 | §3.4 表「ヘルパ」列で各 factory が使うヘルパを機械化(実装担当 AI が表を引いて使用ヘルパを判断)、§3.5 新規操作追加ルールに「ファイル input 型判定基準」追加、`triggerInputFileAndExpectChange` 単体テストで「対象が `<input type="file">` でない場合に赤」を検証(誤用時に明示的エラー) |
| **`triggerInputFileAndExpectChange` の `setInputFiles` 副作用 change handler が非同期**(v1.3 回帰懸念、v1.4 で実体反映) | change handler が非同期完了する前に `getStateSnapshot` を取ると state が古い可能性 | **v1.4 反映**: `stateLoadedFromFile` factory で `beforeClick`(dialog auto-accept)+ `afterClick`(`waitForFunction` で state 反映待ち)を内蔵。**現実装は `FileReader.onload` で非同期**(v1.3 で「同期」と誤記していたが、Codex SF#2 で指摘され v1.4 で実体に修正)。サンプル e2e で confirm/alert/FileReader/alert/UI 反映の 5 段検証を実コードで提示 |
| **stateLoaded(#19) / stateReset(#21) / masterImported(#17 overwrite モード時 + file 経由時) の dialog handling**(v1.4 で追加) | Stage 2a の helper 単体・サンプル e2e では使わないが、Stage 2b 置換時に dialog 発火を見落とすとテストが timeout または fail | Stage 2a 実装時はテスト側責任(`page.on('dialog', d => d.accept())` を beforeAll または factory.beforeClick に手仕込み)、Stage 2b 仕様で factory レベル対応を正式化(§10.4)。§3.4 末尾の「confirm-gated P0 操作一覧 + dialog handling 標準形」で全 4 操作を一覧化、見落としを防ぐ |

---

## 9. 参照

- A-T 仕様書 v1.3:`docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- A-T Stage 1 完了レポート:`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1:`docs/specs/_business_model.md`(commit a5fda4a)
- DevSecOps 運用方針 v1.2.5:shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- 本仕様書 v1 用 ChatGPT メタレビュー依頼:`docs/specs/20260506_0758_shogi_at_stage_2a_chatgpt_review_prompt.md`
- 本仕様書 v1.2 ChatGPT 再レビュー依頼:`docs/specs/20260506_1021_shogi_at_stage_2a_chatgpt_review_prompt_v1_2.md`(commit a1c7568、A 判定受領済み)
- 本仕様書 v1.2 Codex 独立レビュー依頼:`docs/specs/20260506_1135_shogi_at_stage_2a_codex_review_prompt.md`(commit d6832af、B+ 判定受領済み)
- 本仕様書 v1.2 → v1.3 Codex 独立レビュー結果(B+、Must Fix 2 + Should Fix 3 + Nice to Have 2 を v1.3 で吸収)
- A-T フェーズ境界 Codex テンプレート集:`docs/specs/20260505_2046_shogi_at_codex_review_prompt.md`

---

## 10. Stage 2b 申し送り(v1.2 で確定、Stage 2b 仕様書で再設計、v1.3 で `masterImported` 追加要件を §3.4 末尾に集約)

### 10.1 Should Fix #4: `roundConfirmed(cls, options)` の `isFinal` 自動判定

(v1.2 から踏襲、変更なし)

**現状(v1.3 / Stage 2a)**: `options.isFinal` をテスト側で手指定。`isFinal` 自動判定(案A 手指定 / 案B factory 内自動)は Stage 2b 仕様書で確定。

### 10.2 Should Fix #5: `pairingsRegenerated(cls, options)` の `allowSameContent` 運用ルール

(v1.2 から踏襲、変更なし)

**現状(v1.3 / Stage 2a)**: `options.allowSameContent` をテスト側で手指定(既定 false)。運用ルール(原則 false / 理由必須記載 / テストデータ意図設計)は Stage 2b 仕様書で正式化。

### 10.3 v1.3 で新規追加: `masterImported` 関連の追加要件

`masterImported`(#17)について Stage 2a では §3.4 末尾「実装時確認可」+「confirm-gated P0 操作一覧」に注記して実装担当のテスト側責任とする。Stage 2b 仕様書では以下を正式化:

- **mi-mode ラジオ設定**: factory option として `mode: 'merge' | 'overwrite'` を追加するか、テスト側 fill のままにするか
- **`overwrite` 時の confirm 受諾**: `factory.beforeClick` で `page.on('dialog', d => d.accept())` を仕込む形を標準化
- **ファイル経由マスタインポート**: `#mi-file` は可視 input なので `clickAndExpectChange(#mi-run, ...)` の流れで対応可能。`factory.beforeClick` で `setInputFiles(#mi-file, filePath)` を実施する形を標準化
- **異常系**(両方指定エラー / 両方空エラー): `errorMessageShown` 系の primary assertion を新設するか、サンプル e2e の異常系として 2 件追加するか

### 10.4 v1.4 で新規追加: confirm-gated P0 操作の factory レベル対応(Codex v1.3 SF#1 から派生)

Codex v1.3 独立再レビューで確認された、`shogi_v4.html` の dialog 発火構造に基づき、Stage 2a では `stateLoadedFromFile`(#20)のみ factory レベル対応(§4.3 #20、`beforeClick` で dialog auto-accept + `afterClick` で `waitForFunction`)。残り 3 件は **Stage 2a テスト側責任**(§3.4 末尾「confirm-gated P0 操作一覧」)とし、Stage 2b 仕様書で factory レベル正式化:

- **`stateLoaded`(#19)** `loadFromPaste()`: confirm + alert(2 回 dialog)+ 初期 disabled(`#load-paste-area` 入力で enable)
  - Stage 2b で factory に `beforeClick`(dialog auto-accept)+ `requiresFillBeforeEnable` 対応(`#load-paste-area` への自動 fill or テスト側責任明記)を正式化
- **`stateReset`(#21)** `resetAll()`: confirm のみ(1 回 dialog、alert なし、`showMsg` は DOM バナー)
  - Stage 2b で factory に `beforeClick`(dialog auto-accept、confirm 1 件のみ)を正式化
- **`masterImported`(#17 overwrite モード時 + file 経由時)** `runMasterImport()`: confirm 1 件(overwrite 時)+ FileReader 非同期(file 経由時)
  - §10.3 で扱う mi-mode / confirm / file 統合対応の一部として、`stateLoadedFromFile` と同様の `beforeClick`(dialog)+ `afterClick`(`waitForFunction`)+ `setInputFiles(#mi-file)` を Stage 2b 仕様で正式化

#### Stage 2b で検討する meta フィールド拡張

Codex v1.3 SF#1 で提案された以下の meta フィールド拡張は、Stage 2a 範囲では過剰(Codex も提案レベル)。Stage 2b 仕様書で必要性を再評価:

- `meta.dialogCount: number` — dialog 発火回数
- `meta.dialogTypes: ('confirm' | 'alert' | 'prompt')[]` — dialog 種別
- `meta.asyncWait: string` — `waitForFunction` の待ち条件(state パス等)
- `meta.requiresFillBeforeEnable: { selector, value }` — disabled 解除のための fill 前提

これらを採用するか、または現行の `beforeClick` / `afterClick` 内に直接書く形を維持するかは、Stage 2b で既存 spec 置換時の運用感を見て判断。

### 10.5 v1.5 で新規追加: 他 factory での「非同期 + DOM mutation」パターン再発リスク

Stage 2a 実装(commit 7afd060)で `tournamentDataCopied`(#18)に以下 2 系統の問題が発覚:

- **A. 非同期完了待ち(`writeText().then(alert)` 系)**: `saveData()` のように production code 側で非同期処理 + dialog 発火する関数があると、click 後の即時 assertion では検証できない。assertion 内で polling 待ち + `beforeClick` で dialog auto-accept が必要
- **B. production code 側 DOM mutation(`syncBranchMasterOnSave()` 系)**: production code が click ハンドラ内で state を更新する場合、`before.state` と `after.state` で意味のある差が出る。assertion が `before.state` と一致を期待していると、production の正常動作で false positive となる

Stage 2a では `tournamentDataCopied` のみで顕在化したが、Stage 2b で他 P0 factory 置換時に同種パターンが発覚する可能性が高い。候補:

- **#22 `reportDownloaded`**: `printResults()` が `window.print()` を呼ぶ前後で `setTimeout` / `requestAnimationFrame` 経由で DOM 操作する可能性
- **#19 `stateLoaded`(#load-from-paste)**: `applyLoadedJson()` 内部で `syncBranchMasterOnLoad()` 等の mutation がある可能性(現状は同期だが要確認)
- **#9 `roundConfirmed` / #10 `pairingsRegenerated`**: production code 側で `localStorage.save()` 後に `showMsg()` 等の DOM 更新

#### Stage 2b 置換時の標準対応手順

Stage 2b 担当(Claude Code または ChatGPT/Codex 経由の実装担当)は、各 factory 置換時に以下を確認:

1. **対応 production 関数の本体を sed/grep で確認**(`function 関数名` の本体 30〜50 行)
2. **非同期処理(`setTimeout` / `Promise.then` / `async/await` / `FileReader` / `clipboard.writeText`)があるか**
3. **DOM mutation(`state.X = ...` / `state.X.push(...)` / member_id 補完等の sync 処理)があるか**
4. **dialog 発火(`confirm` / `alert` / `prompt`)があるか**

該当があれば factory に以下を追加:

- 非同期 → assertion 内で polling 待ち または `afterClick` で `waitForFunction`
- DOM mutation → assertion の比較対象を `before.state` ではなく `after.state` または専用フィールドに
- dialog → `beforeClick` で `page.on('dialog', d => d.accept())`

**Stage 2b 仕様書で正式化**: 上記手順を Stage 2b spec の「factory 置換チェックリスト」として明記、現状の §3.4 末尾「confirm-gated P0 操作一覧」と統合した「production 連携パターン一覧」に拡張する方針。

---

**END**
