# Phase A-T Stage 2a 仕様書 v1.1:UI テストヘルパ実装(`expectClickable` + `clickAndExpectChange`)

**配置先**: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`(同名上書き、v1 → v1.1)
**最終更新**: 2026-05-06 08:05 JST
**対象ブランチ**: `feat/phase-a-t-stage-2a-helpers`(main 1aa8e02 から派生)
**準拠**: A-T spec v1.3、DevSecOps 運用方針 v1.2.5、L0 業務モデル文書 v1.1
**位置づけ**: A-T フェーズ Stage 2a の実装仕様書。Stage 2b/2c/4 の前提となるヘルパ基盤の設計を確定する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1 | 2026-05-06 07:52 | 初版起草。A-T spec v1.3 §0.2/§4/§5 + Stage 1 レポート §4.6 + L0 業務モデル文書 v1.1 §1.5 P0 を統合 | Claude.ai |
| v1.1 | 2026-05-06 08:05 | ChatGPT B+ レビュー反映: Must Fix 2 件(primary assertion 必須化を機械保証 + clipboard/print 系を扱える API 拡張)+ Should Fix 7 件 + Nice to Have 4 件すべて吸収。`clickAndExpectChange` API を factory 形式 + ctx 形式の併存に拡張、`options.beforeClick/afterClick` 追加、`shogi_assertions.js` の全 22 factory を `{assertion, meta, beforeClick?, afterClick?}` 構造に再設計 | Claude.ai |

---

## 1. 経緯と背景・スコープ

### 1.1 経緯

A-4.2(commit 73961d3)で A/B クラスボタンが実機では動作しないリグレッションが発生したが、e2e 124 件 / 単体 595 件のテストすべてを通過した。Stage 1 完了レポート(commit 3f38a13)で「観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当」が主因と判明。playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。

A-T spec v1.3 §4.2/§4.3 で `expectClickable` + `clickAndExpectChange` の 2 ヘルパが設計された。Stage 2a は**この 2 ヘルパの実装と shogi 固有 primary assertion カタログの整備**を担う。

### 1.2 スコープ

#### スコープ内(IN)

1. `expectClickable` ヘルパ実装(A-T spec v1.3 §4.2 の 7 段階検証 + NH#2 小要素 hit-test 補正)
2. `clickAndExpectChange` ヘルパ実装(**v1.1 で API 拡張**:factory 形式 + ctx 形式併存、`options.beforeClick/afterClick`、page 引数追加、primary assertion 必須化を機械保証)
3. `getStateSnapshot` ヘルパ実装(state + master + localStorage + URL + activeTab、NH#1 DOM query オプション付き)
4. `stableStringify` 比較ヘルパ実装(NH#3、`expectStateChanged` / `expectStateUnchanged` 含む)
5. **shogi 固有 primary assertion カタログ拡充**:A-T spec v1.3 §4.3.7 の 8 操作 → L0 §1.5 P0 の 19 操作分(分割で実質 22 factory)+ **clipboard/print/file 系を含む完全網羅**(SF #5 含む)
6. ヘルパ単体テスト(成功/失敗パターン、特に **primary assertion 0 件で赤になる証明** SF #6/#7 連動)
7. サンプル e2e テスト 2 件(primary assertion ありで緑、primary assertion なしで赤の両方を検証)

#### スコープ外(OUT、後続 Stage で対応)

| 項目 | 対応 Stage | 理由 |
|---|---|---|
| `shogi_app_a4_2.spec.js` の既存 click を新ヘルパに置換 | Stage 2b | A-4.2 関連を先行置換 |
| 残り 4 spec ファイル(`index_layout` / `shogi_app` / `shogi_app_a3` / `shogi_app_a4`)の置換 | Stage 2c | A-4.2 再発防止効果を早期に得るため後段 |
| A-4.2 既知不具合 commit 73961d3 への最小再現テスト(赤確認) | Stage 4 | Stage 2a/2b 完了後 |
| Mutation Testing | Stage 2c の Codex Yes YAML 段階 | カタログと置換が完了してから |
| L0 §1.5 P1(モーダル開閉等)11 操作の `clickAndExpectChange` 適用 | Stage 2b 以降 | P0 を先に固める |

**v1.1 注**:v1 では P2(印刷/ファイル選択/クリップボード)を Stage 2c 送りとしていたが、**Must Fix #2 解決として API 拡張で P0 内に取り込む**。これにより clipboard/print/file 系も Stage 2a で対応可能になり、Stage 2b/2c の作業が単純化される。

### 1.3 ユーザーストーリー

#### US-2a-1(Claude Code 視点・Stage 2a 主目的):primary assertion を「書き忘れ得ない」状態を機械的に保証する

> 実装担当の AI として、新規 click テストを書く時、`clickAndExpectChange` を呼ぶだけで「`expectedChange` 内に primary semantic assertion を 1 つ以上**機械検証可能な形で**宣言しないとテストが**必ず赤になる**」状態にしたい。
> v1.1 では factory 戻り値の `meta.primaryAssertions` または raw callback の `ctx.primary()` 呼び出し回数で機械検証する設計に強化。

#### US-2a-2(Claude.ai 視点):L0 §1.5 P0 19 操作のすべてに primary assertion を確定する

> Stage 2a 完了時点で L0 §1.5 P0 の 19 操作すべてに対して **shogi 固有 primary assertion factory** がカタログ化され、Stage 2b で既存 spec を置換する際に「どの factory を呼べばよいか」を辞書引きで決定できる状態にしたい。

#### US-2a-3(将来の AI 視点):新規操作追加が「factory に 1 つ追加 + テスト 1 件」で完結する

> 将来 A-7 / A-8 / A-9 等で新規 click 操作を追加する AI として、§3.5 新規操作追加ルールに従い「`shogi_assertions.js` に factory を 1 つ追加 + テストを 1 件書く」だけで安全に導入できる土台にしたい。

---

## 2. 着手前条件(既達確認)

| 条件 | 状態 | 根拠 |
|---|---|---|
| L0 業務モデル文書が `docs/specs/_business_model.md` に存在 | ✅ 既達 | commit a5fda4a(v1.1、ChatGPT 再レビュー A-) |
| 業務ジャーニー記載 | ✅ 既達 | L0 §2 |
| データフロー記載 | ✅ 既達 | L0 §6 |
| データフィールド全リスト | ✅ 既達 | L0 §5 |
| state スキーマ | ✅ 既達 | L0 §4.2 |
| UI 重要操作カタログ | ✅ 既達 | L0 §1.5 P0/P1/P2 |
| Stage 1 完了レポート | ✅ 既達 | commit 3f38a13 |

**判定**: Stage 2a 着手 OK。

---

## 3. 設計

### 3.1 `expectClickable` ヘルパ仕様(A-T spec v1.3 §4.2 + NH#2 小要素対応)

```javascript
// test/helpers/expectClickable.js
const { expect } = require('@playwright/test');

async function expectClickable(locator) {
  // 1. 物理的存在
  await expect(locator).toBeAttached();
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();

  // 2. viewport 内に収める
  await locator.scrollIntoViewIfNeeded();

  // 3. 矩形検証
  const rect = await locator.boundingBox();
  expect(rect, '要素が描画されていない').not.toBeNull();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);

  // 4. CSS 計算値検証
  const style = await locator.evaluate(el => {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents,
      opacity: parseFloat(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
    };
  });
  expect(style.pointerEvents).not.toBe('none');
  expect(style.opacity).toBeGreaterThanOrEqual(0.5);
  expect(style.visibility).not.toBe('hidden');
  expect(style.display).not.toBe('none');

  // 5. ancestor chain 検証
  const ancestorBlocked = await locator.evaluate(el => {
    let cur = el.parentElement;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.display === 'none') return 'ancestor display:none';
      if (cs.visibility === 'hidden') return 'ancestor visibility:hidden';
      if (cur.hasAttribute('inert')) return 'ancestor inert';
      if (cur.getAttribute('aria-disabled') === 'true') return 'ancestor aria-disabled';
      if (cur.tagName === 'FIELDSET' && cur.disabled) return 'ancestor disabled fieldset';
      cur = cur.parentElement;
    }
    return null;
  });
  expect(ancestorBlocked, `祖先要素にブロック要因: ${ancestorBlocked}`).toBeNull();

  // 6. hit-test(NH#2 小要素対応:点を rect 内に clamp、重複点除去)
  const hitResult = await locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    // 小要素対応: width/height < 4 の場合は中央 1 点のみ
    let points;
    if (r.width < 4 || r.height < 4) {
      points = [[r.left + r.width / 2, r.top + r.height / 2]];
    } else {
      const inset = 1;  // 境界から 1px 内側
      points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + inset, r.top + inset],
        [r.right - inset, r.top + inset],
        [r.left + inset, r.bottom - inset],
        [r.right - inset, r.bottom - inset],
      ];
      // 重複点除去
      const seen = new Set();
      points = points.filter(([x, y]) => {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return points.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return { x, y, hit: top === el || (top && el.contains(top)) };
    });
  });
  const allHit = hitResult.every(p => p.hit);
  expect(allHit, `hit-test の一部が他要素にブロックされている: ${JSON.stringify(hitResult)}`).toBe(true);
}

module.exports = { expectClickable };
```

**重要禁止事項**:`force: true` の使用禁止(リポジトリ全体で grep 検証、Stage 1 で既達確認済み)。

### 3.2 `clickAndExpectChange` ヘルパ仕様(v1.1 で API 拡張、Must Fix #1/#2 解決)

```javascript
// test/helpers/clickAndExpectChange.js
const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');

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
 * @param {Locator} locator - クリック対象
 * @param {Function|Object} expectedChange - 以下のいずれか:
 *   (a) factory 戻り値 { assertion, meta, beforeClick?, afterClick? }
 *   (b) raw callback: async (before, after, ctx, page) => { ctx.primary('...'); ... }
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
| 9 | ラウンド確定 | `#submitBtn_{cls}` | 現在ラウンドを確定し次ラウンドを生成 | `roundConfirmed(cls, options)` | state | **SF#2 反映:`options.isFinal=true` で次 pairings 不要** |
| 10 | ペアリング再生成 | `#repairBtn_{cls}` | 現在ラウンドの pairings のみを再生成 | `pairingsRegenerated(cls, options)` | state | **SF#3 反映:`options.allowSameContent=true` で内容変化を任意化** |
| 11 | 対戦相手変更保存 | `#chg-save` | 現在ラウンドの p1/p2 を変更 | `opponentChanged(cls, matchIndex)` | state | - |
| 12 | 過去対局勝者変更 | `#ep-p1` / `#ep-p2`(モーダル内) | 確定済みラウンドの勝者を変更 | `pastWinnerChanged(cls, round, matchIndex)` | state | - |
| 13 | 名前一括編集保存 | `#bulk-save` | 複数参加者の名前を一括変更 | `bulkNamesEdited(cls)` | state | - |
| 14 | マスタ追加 | `#me-save`(新規時、`data-mid` なし) | 過去参加者マスタに新メンバー追加 | `masterMemberAdded()` | state(master) | - |
| 15 | マスタ編集 | `#me-save`(既存、`data-mid` 付き) | 既存メンバーの name/yomi を変更 | `masterMemberEdited(targetId)` | state(master) | - |
| 16 | マスタ論理削除 | マスタ画面の削除ボタン | メンバーを tombstone 化 | `masterMemberDeleted(targetId)` | state(master) | `deleted_at` 必須 |
| 17 | マスタインポート実行 | `#mi-run` | 貼付 JSON をマスタにマージ | `masterImported(options)` | state(master) | **SF#4 反映:length 増加 / 既存不変 / tombstone OR / schema_version 維持を分離検証** |
| 18 | 大会データコピー | `#saveBtn` | state をクリップボードに JSON 退避 | `tournamentDataCopied()` | clipboard(spy) | **SF#5 反映:`context.grantPermissions(['clipboard-read', 'clipboard-write'])` 必須** |
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

これらの結果に応じて、対応する factory のロジックを微調整する(仕様書 v1.2 化までは不要、実装着手時のメモで対応可)。

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

### 3.7 stableStringify ヘルパ(NH#3)

`JSON.stringify` の順序差・不要差分による不安定化を避ける:

```javascript
// test/helpers/stableStringify.js
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
├── helpers/
│   ├── expectClickable.js              # 新規(§3.1、NH#2 hit-test 改善含む)
│   ├── clickAndExpectChange.js         # 新規(§3.2、getStateSnapshot 含む)
│   ├── shogi_assertions.js             # 新規(§4.3、22 factory)
│   ├── stableStringify.js              # 新規(§3.7、NH#3)
│   └── __tests__/
│       ├── expectClickable.test.js     # 新規(§5.1)
│       ├── clickAndExpectChange.test.js # 新規(§5.1、primary 必須化検証)
│       └── shogi_assertions.test.js    # 新規(§5.1、各 factory の meta 検証)
└── e2e/
    └── sample/
        └── at_stage_2a_sanity.spec.js  # 新規(§5.2、緑1件 + 赤1件)
```

### 4.2 命名規則

- ヘルパ関数:キャメルケース
- factory 名:操作の業務目的を表す動詞句(`participantAdded`、`tournamentStarted`、`reportDownloaded`)
- factory 戻り値:`{ assertion, meta, beforeClick?, afterClick? }`

### 4.3 `shogi_assertions.js` の構造(v1.1 で factory 形式に再設計)

```javascript
// test/helpers/shogi_assertions.js
const { expect } = require('@playwright/test');
const { expectStateChanged } = require('./stableStringify');

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

  // #9 ラウンド確定(SF#2 反映:最終ラウンド分岐)
  roundConfirmed: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length + 1);
      if (!options.isFinal) {
        // 中間ラウンド: 次 pairings 生成を必須
        expectStateChanged(before, after, `state.pairings.${cls}`);
      }
      // 最終ラウンド時は pairings 変化を任意(空配列化等の実装依存)
    },
    meta: {
      primaryAssertions: options.isFinal ? 1 : 2,
      primaryTypes: ['state'],
      operation: 'roundConfirmed',
      description: `${cls}クラスのラウンド確定${options.isFinal ? '(最終)' : ''}`,
    },
  }),

  // #10 ペアリング再生成(SF#3 反映:同内容の場合の扱い)
  pairingsRegenerated: (cls, options = {}) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls].length).toBe(before.state.results[cls].length);  // results 不変
      if (!options.allowSameContent) {
        expectStateChanged(before, after, `state.pairings.${cls}`);
      }
      // 制約上同内容になる場合は results 不変 + pairings 構造妥当性のみ検証
    },
    meta: {
      primaryAssertions: options.allowSameContent ? 1 : 2,
      primaryTypes: ['state'],
      operation: 'pairingsRegenerated',
      description: `${cls}クラスのペアリング再生成`,
    },
  }),

  // #11 対戦相手変更保存
  opponentChanged: (cls, matchIndex) => ({
    assertion: async (before, after, page) => {
      const beforeMatch = before.state.pairings[cls][matchIndex];
      const afterMatch = after.state.pairings[cls][matchIndex];
      const changed = afterMatch.p1 !== beforeMatch.p1 || afterMatch.p2 !== beforeMatch.p2;
      expect(changed).toBe(true);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'opponentChanged',
      description: `${cls}クラス第${matchIndex}組の対戦相手変更`,
    },
  }),

  // #12 過去対局勝者変更
  pastWinnerChanged: (cls, round, matchIndex) => ({
    assertion: async (before, after, page) => {
      expect(after.state.results[cls][round][matchIndex].winner)
        .not.toBe(before.state.results[cls][round][matchIndex].winner);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state'],
      operation: 'pastWinnerChanged',
      description: `${cls}クラス第${round}ラウンド第${matchIndex}組の勝者変更`,
    },
  }),

  // #13 名前一括編集保存
  bulkNamesEdited: (cls) => ({
    assertion: async (before, after, page) => {
      const changed = after.state.players[cls].some(
        (p, i) => p.name !== before.state.players[cls][i].name
      );
      expect(changed).toBe(true);
    },
    meta: {
      primaryAssertions: 1,
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
      const changed = afterMember.name !== beforeMember.name
                   || afterMember.yomi !== beforeMember.yomi;
      expect(changed).toBe(true);
    },
    meta: {
      primaryAssertions: 1,
      primaryTypes: ['state-master'],
      operation: 'masterMemberEdited',
      description: `マスタ member ${targetId} の name/yomi 変更`,
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

  // #18 大会データコピー(clipboard primary、SF#5 permission 必須)
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
      setupRequired: 'context.grantPermissions(["clipboard-read", "clipboard-write"])',
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

### 4.5 ChatGPT v1.0 → v1.1 Stage 2a 仕様書レビュー指摘の吸収(本 v1.1 で吸収)

| 指摘 | 吸収箇所 | 対応 |
|---|---|---|
| Must Fix #1: primary assertion 必須化を機械保証 | §3.2 + §4.3 全 factory + §5.1 + §5.2 + §6 | factory 形式 + ctx 形式併存、`primaryCount >= 1` 検証 |
| Must Fix #2: clipboard/print/file を扱える API 拡張 | §3.2 options 拡張 + §4.3 #18/#20/#22 | `options.beforeClick/afterClick`、factory に beforeClick/afterClick 内蔵、page 引数追加 |
| Should Fix #1: B クラス pairings 確認 | §3.4 #6 + §4.3 `tournamentStarted` | 反映 |
| Should Fix #2: ラウンド確定の最終分岐 | §3.4 #9 + §4.3 `roundConfirmed` | `options.isFinal` |
| Should Fix #3: ペアリング再生成の同内容扱い | §3.4 #10 + §4.3 `pairingsRegenerated` | `options.allowSameContent` |
| Should Fix #4: マスタインポート分離検証 | §3.4 #17 + §4.3 `masterImported` | `options.expectedNewCount/existingMemberIds/tombstoneOrIds` で分離 |
| Should Fix #5: clipboard permission | §3.4 #18 + §4.3 `tournamentDataCopied` + §6 | `meta.setupRequired` 明示 + 完了基準に追加 |
| Should Fix #6: サンプル e2e 修正 | §5.2 | 「primary なしで赤」を実テストに |
| Should Fix #7: 完了基準に「primaryAssertions=0 が赤」 | §6 | 追加 |
| Nice to Have #1: DOM query snapshot option | §3.2 `getStateSnapshot(page, options)` | 反映 |
| Nice to Have #2: hit-test 小要素対応 | §3.1 step 6 | 反映 |
| Nice to Have #3: stableStringify helper | §3.7(新設) + 各 factory で活用 | 反映 |
| Nice to Have #4: Codex Yes YAML 仮定義 | §6 末尾 | 反映 |

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

### 5.2 サンプル e2e テスト(Should Fix #6 反映)

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

});
```

---

## 6. 完了基準

A-T spec v1.3 §Stage 2a 完了基準準拠 + 本仕様書 v1.1 追加項目:

- ✅ `expectClickable` ヘルパが §3.1 の 7 段階検証すべてを実装(NH#2 小要素対応含む)
- ✅ `clickAndExpectChange` ヘルパが §3.2 の API 拡張(factory + ctx 併存、options.beforeClick/afterClick、page 引数)を実装
- ✅ `getStateSnapshot` が L0 §4.1 の 3 LocalStorage キー + state + master + url + activeTab を取得、NH#1 DOM query option 対応
- ✅ `stableStringify` + `expectStateChanged/Unchanged` ヘルパ実装(§3.7、NH#3)
- ✅ `shogi_assertions.js` に §3.4 の 22 factory が完備、全 factory が `meta.primaryAssertions >= 1` を持つ
- ✅ §3.5 新規操作追加ルールが仕様書に明記
- ✅ ヘルパ単体テスト(§5.1):合計 25 件以上、全件緑
- ✅ **`primaryAssertions=0` の expectedChange を渡すと必ず赤になる単体テスト + e2e テストが緑(SF#7 連動)**
- ✅ サンプル e2e テスト(§5.2):正常系 1 件 + 異常系 2 件、計 3 件全件緑(異常系は「赤になることを期待」して try/catch で緑)
- ✅ リポジトリ全体の `force: true` 使用箇所がゼロ(grep 検証、Stage 1 で既達確認済み)
- ✅ 既存 e2e 124 テスト(130 click)に影響なし(全件緑のまま)
- ✅ clipboard 系テストで `context.grantPermissions(['clipboard-read', 'clipboard-write'])` 設定の文書化(SF#5)
- ✅ Codex フェーズ境界レビュー A 以上

### Codex Yes YAML 仮定義(NH#4、Stage 2c で正式化)

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
  verdict: "Yes"
```

---

## 7. 受け入れ基準

- 本仕様書(v1.1)が ChatGPT メタレビュー A- 以上(再レビュー)
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

---

## 9. 参照

- A-T 仕様書 v1.3:`docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- A-T Stage 1 完了レポート:`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1:`docs/specs/_business_model.md`(commit a5fda4a)
- DevSecOps 運用方針 v1.2.5:shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- 本仕様書 v1 用 ChatGPT メタレビュー依頼:`docs/specs/20260506_0758_shogi_at_stage_2a_chatgpt_review_prompt.md`(commit 後に追加)
- 本仕様書 v1 ChatGPT メタレビュー結果(本セッション内、Must Fix 2 + Should Fix 7 + Nice to Have 4 を v1.1 で全吸収)

---

**END**
