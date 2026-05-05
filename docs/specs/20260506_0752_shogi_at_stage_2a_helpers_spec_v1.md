# Phase A-T Stage 2a 仕様書 v1：UI テストヘルパ実装(`expectClickable` + `clickAndExpectChange`)

**配置先**: `docs/specs/20260506_0752_shogi_at_stage_2a_helpers_spec_v1.md`
**作成日時**: 2026-05-06 07:52 JST
**対象ブランチ**: `feat/phase-a-t-stage-2a-helpers`(main 1aa8e02 から派生)
**準拠**: A-T spec v1.3、DevSecOps 運用方針 v1.2.5、L0 業務モデル文書 v1.1
**位置づけ**: A-T フェーズ Stage 2a の実装仕様書。Stage 2b(既存 spec の置換)・Stage 4(A-4.2 回帰テスト)・Stage 2c(残 spec 置換 + Codex Yes YAML)の前提となる**ヘルパ基盤の設計**を確定する。

---

## 0. 改訂履歴

| 版 | 日時 | 変更内容 | 起草者 |
|---|---|---|---|
| v1 | 2026-05-06 07:52 | 初版起草。A-T spec v1.3 §0.2/§4/§5 + Stage 1 レポート §4.6 + L0 業務モデル文書 v1.1 §1.5 P0 を統合。ChatGPT v1.1 再レビューの Should Fix #1(報告書 assertion 統一)・#2(pairings/results 用語整理)・#3(§9.2 接続文)を吸収 | Claude.ai |

---

## 1. 経緯と背景・スコープ

### 1.1 経緯

A-4.2(commit 73961d3)で A/B クラスボタンが実機では動作しないリグレッションが発生したが、e2e 124 件 / 単体 595 件のテストすべてを通過した。Stage 1 完了レポート(commit 3f38a13)で原因を機械的に分析した結果、**観点 2(クリック前検証不在)が e2e 130/130 click = 100% 該当**と判明。playwright の `locator.click()` が `pointer-events: none` / overlay / inert を踏み抜き、`onClick` ハンドラを直接トリガーしていた。

この構造的欠陥を解消するため、A-T spec v1.3 §4.2/§4.3 で `expectClickable` + `clickAndExpectChange` の 2 ヘルパが設計された。Stage 2a は**この 2 ヘルパの実装と shogi 固有 primary assertion カタログの整備**を担う。

### 1.2 スコープ

#### スコープ内(IN)

1. `expectClickable` ヘルパ実装(A-T spec v1.3 §4.2 の 7 段階検証)
2. `clickAndExpectChange` ヘルパ実装(A-T spec v1.3 §4.3 の 5 ステップ + primary semantic assertion 必須化)
3. `getStateSnapshot` ヘルパ実装(state + localStorage + URL のスナップショット取得)
4. **shogi 固有 primary assertion カタログ拡充**:A-T spec v1.3 §4.3.7 の 8 操作 → L0 §1.5 P0 の 19 操作分に拡張
5. ヘルパ単体テスト(成功/失敗パターン、特に偽陽性除去能力の証明)
6. サンプル e2e テスト 1 件(primary assertion ありなしの判定動作確認)

#### スコープ外(OUT、後続 Stage で対応)

| 項目 | 対応 Stage | 理由 |
|---|---|---|
| `shogi_app_a4_2.spec.js` の既存 click を新ヘルパに置換 | Stage 2b | Stage 2a でヘルパ完成後、A-4.2 関連を先行置換 |
| 残り 4 spec ファイル(`index_layout` / `shogi_app` / `shogi_app_a3` / `shogi_app_a4`)の 126 件単純置換 + 4 件完全書き直し | Stage 2c | A-4.2 再発防止効果を早期に得るため後段 |
| A-4.2 既知不具合 commit 73961d3 に対する最小再現テスト(赤確認) | Stage 4 | Stage 2a/2b 完了後 |
| Mutation Testing(偽陽性テスト排除) | Stage 2c の Codex Yes YAML 段階 | カタログと置換が完了してから |
| L0 §1.5 P1(モーダル開閉等)11 操作の `clickAndExpectChange` 適用 | Stage 2b 以降 | P0 を先に固める |
| L0 §1.5 P2(印刷 / ファイル選択 / クリップボード)3 操作の stub/spy 設計 | Stage 2c | P2 は実装が環境依存 |

### 1.3 ユーザーストーリー(A-T spec v1.3 §0.2 から派生)

#### US-2a-1(Claude Code 視点・Stage 2a 主目的):新規 click テストで primary assertion を「書き忘れ得ない」状態を作る

> 実装担当の AI として、新規 click テストを書く時、`clickAndExpectChange(locator, expectedChange)` を呼ぶだけで「`expectedChange` 内に primary semantic assertion を 1 つ以上宣言しないとテストが赤になる」状態にしたい。通知表示のみを成功条件にしてしまう A-4.2 型のテストを「書きたくても書けない」構造にすることで、注意力に依存しない品質を実現する。

#### US-2a-2(Claude.ai 視点):L0 §1.5 P0 19 操作のすべてに primary assertion を確定する

> 設計担当の AI として、Stage 2a 完了時点で L0 §1.5 P0 の 19 操作すべてに対して **shogi 固有 primary assertion** がカタログ化されており、Stage 2b で既存 spec を置換する際に「どの assertion を書けばよいか」を辞書引きで決定できる状態にしたい。

#### US-2a-3(将来の AI 視点):新規操作追加が「カタログに 1 行 + テスト 1 件」で完結する

> 将来 A-7 / A-8 / A-9 等で新規 click 操作を追加する AI として、§4.3.8 新規操作追加ルールに従い「カタログに 1 行追加 + テストを 1 件書く」だけで安全に導入できる土台にしたい。

---

## 2. 着手前条件(既達確認)

A-T spec v1.3 §Stage 2 着手前条件に基づく確認:

| 条件 | 状態 | 根拠 |
|---|---|---|
| L0 業務モデル文書が `docs/specs/_business_model.md` に存在 | ✅ 既達 | commit a5fda4a(v1.1、ChatGPT 再レビュー A-、Must Fix 0 件) |
| 業務ジャーニー記載 | ✅ 既達 | L0 §2 ジャーニー A〜F |
| データフロー記載 | ✅ 既達 | L0 §6 データフロー(参加者追加・ラウンド確定・データコピー・読み込み・マスタ更新の 5 種) |
| データフィールド全リスト | ✅ 既達 | L0 §5(共通ヘッダー / 4 タブ / 動的生成要素) |
| state スキーマ | ✅ 既達 | L0 §4.2(normalizeState 通過後の保証構造) |
| UI 重要操作カタログ | ✅ 既達 | L0 §1.5 P0/P1/P2 計 33 操作 |
| Stage 1 完了レポート | ✅ 既達 | commit 3f38a13(124 tests / 130 clicks 偽陽性分析) |

**判定**: Stage 2a 着手 OK。

---

## 3. 設計

### 3.1 `expectClickable` ヘルパ仕様(A-T spec v1.3 §4.2 から確定転記)

クリック前に以下 7 段階をすべて満たすことを検証。**`force: true` 禁止**(A-4.2 リグレッションの根本原因)。

```javascript
// test/helpers/expectClickable.js
const { expect } = require('@playwright/test');

async function expectClickable(locator) {
  // 1. 物理的存在: 要素が DOM に存在し、可視で、有効化されている
  await expect(locator).toBeAttached();
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();

  // 2. scrollIntoViewIfNeeded で viewport 内に収める
  await locator.scrollIntoViewIfNeeded();

  // 3. 矩形検証: rect.width/height > 0、viewport 内
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

  // 5. ancestor chain 検証: 祖先要素にブロック要因(display:none / visibility:hidden /
  //    inert / aria-disabled="true" / disabled fieldset)がないことを確認
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

  // 6. 5 点 hit-test: elementFromPoint で 5 点すべてが自身または子孫であることを検証
  //    z-index・absolute オーバーレイ等の踏み抜きを構造的に検出
  const hitResult = await locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    const points = [
      [r.left + r.width / 2, r.top + r.height / 2],   // 中央
      [r.left + 1, r.top + 1],                        // 左上内側
      [r.right - 1, r.top + 1],                       // 右上内側
      [r.left + 1, r.bottom - 1],                     // 左下内側
      [r.right - 1, r.bottom - 1],                    // 右下内側
    ];
    return points.map(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return top === el || (top && el.contains(top));
    });
  });
  expect(hitResult.every(Boolean), `5 点 hit-test の一部が他要素にブロックされている: ${JSON.stringify(hitResult)}`).toBe(true);

  // 7. CSS 由来の踏み抜き要因(pointer-events / visibility / z-index)
  //    → 上記 4・5・6 で網羅済み
}

module.exports = { expectClickable };
```

### 3.2 `clickAndExpectChange` ヘルパ仕様(A-T spec v1.3 §4.3 + Stage 1 レポート §4.6 から確定転記)

`expectClickable` が「クリック前の物理的可能性」を検証するのに対し、`clickAndExpectChange` は「クリック後の意味的成功条件」を検証する。

```javascript
// test/helpers/clickAndExpectChange.js
const { expect } = require('@playwright/test');
const { expectClickable } = require('./expectClickable');

async function getStateSnapshot(page) {
  return page.evaluate(() => ({
    state: window.state ? JSON.parse(JSON.stringify(window.state)) : null,
    master: (() => {
      try {
        const raw = localStorage.getItem('shogi_branch_master');
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })(),
    localStorage: {
      shogi_v4: localStorage.getItem('shogi_v4'),
      shogi_v3: localStorage.getItem('shogi_v3'),       // legacy
      shogi_branch_master: localStorage.getItem('shogi_branch_master'),
    },
    url: { pathname: location.pathname, hash: location.hash, search: location.search },
    activeTab: (() => {
      const t = document.querySelector('.tab.active');
      return t ? t.id : null;
    })(),
  }));
}

async function clickAndExpectChange(locator, expectedChange) {
  // 1. クリック前検証
  await expectClickable(locator);

  // 2. クリック前 state スナップショット取得
  const page = locator.page();
  const before = await getStateSnapshot(page);

  // 3. クリック実行(force: true 禁止)
  await locator.click();

  // 4. クリック後 state スナップショット取得
  const after = await getStateSnapshot(page);

  // 5. expectedChange を検証(primary semantic assertion を含む)
  await expectedChange(before, after);
}

module.exports = { clickAndExpectChange, getStateSnapshot };
```

**`getStateSnapshot` の取得対象**(L0 §4.1 LocalStorage 3 キーを反映):
- `state`(window.state を deep clone)
- `master`(`shogi_branch_master` をパースしたオブジェクト、頻繁に使うため事前パース)
- `localStorage`(3 キーすべての raw 値)
- `url`(pathname / hash / search)
- `activeTab`(`.tab.active` の id、タブ遷移系操作の URL 代替)

### 3.3 primary semantic assertion 必須化(A-T spec v1.3 §4.3.3〜§4.3.6 から転記)

`expectedChange` には以下のいずれかを **1 つ以上必須**で含める:

| 種類 | 内容 | 適用例 |
|---|---|---|
| **状態変化** | `state` / `master` の差分 | `after.state.players.A.length === before.state.players.A.length + 1` |
| **DOM 変化** | 要素追加・削除・属性変化(DOM が業務状態を反映する場合) | 登録者一覧の `<li>` 行追加 |
| **永続化変化** | localStorage / clipboard の差分 | `JSON.parse(after.localStorage.shogi_v4)` が新 state と一致 |
| **URL/タブ変化** | pathname / hash / activeTab の変化 | `before.activeTab === 'tab-reg' && after.activeTab === 'tab-tournament'` |

**補助 assertion(任意・追加)**:通知表示(showMsg / toast)、アニメーション完了等。primary に追加して書くのは可、**primary の代替には不可**。

**禁止事項**(A-4.2 型悪用防止):
- L0 §1.5 P0 操作で **通知表示のみ** を成功条件とすることを禁止
- 例:`#saveBtn` で `expect(showMsg).toBeVisible()` だけ、実データ未保存 → 不可

**画面遷移系操作の例外**(A-T spec v1.3 §4.3.6):
- 画面遷移・タブ遷移が**業務目的そのもの**の場合(例:`#startBtn` 後の対局管理タブ遷移)、`activeTab` 変化を primary として単独で許容
- 遷移先の主要 DOM 表示確認を補助 assertion として推奨

### 3.4 shogi 固有 primary assertion カタログ(L0 §1.5 P0 19 操作分、本仕様書の核心)

**A-T spec v1.3 §4.3.7 の 8 操作を、L0 §1.5 P0 の 19 操作に拡充。** 本カタログは Stage 2b/2c で既存 spec を置換する際の辞書として使う。

カタログ実装は `test/helpers/shogi_assertions.js` にコード化(§4.3 参照)。

| # | 操作 | セレクタ | 業務目的 | primary assertion |
|---|---|---|---|---|
| 1 | 参加者追加 | `#addBtn` | 受付フォームから参加者を 1 名登録する | `after.state.players[cls].length === before.state.players[cls].length + 1` |
| 2 | クラス選択 A(過去参加者) | `.pp-add-btn[data-cls="A"]` | 過去参加者をパネルから A クラスに登録する | `after.state.players.A.length === before.state.players.A.length + 1` && `after.state.players.A.at(-1).cls === 'A'` |
| 3 | クラス選択 B(過去参加者) | `.pp-add-btn[data-cls="B"]` | 過去参加者をパネルから B クラスに登録する | `after.state.players.B.length === before.state.players.B.length + 1` && `after.state.players.B.at(-1).cls === 'B'` |
| 4 | クラス選択 A(サジェスト) | `.suggest-add-btn[data-cls="A"]` | 入力中サジェストから A クラスに登録 | 上記 #2 と同じ + `after.state.players.A.at(-1).member_id === expected_member_id` |
| 5 | クラス選択 B(サジェスト) | `.suggest-add-btn[data-cls="B"]` | 入力中サジェストから B クラスに登録 | 上記 #3 と同じ + member_id 一致 |
| 6 | 対局開始 | `#startBtn` | 受付完了、トーナメント開始(タブ遷移を伴う業務目的) | `after.state.started === true` && `after.activeTab === 'tab-tournament'` && `after.state.pairings.A.length > 0` |
| 7 | 勝者ボタン p1 | `#wb_{cls}_{i}_p1` | 第 i 組の勝者を p1 に設定 | `after.state.pairings[cls][i].winner === before.state.pairings[cls][i].p1` |
| 8 | 勝者ボタン p2 | `#wb_{cls}_{i}_p2` | 第 i 組の勝者を p2 に設定 | `after.state.pairings[cls][i].winner === before.state.pairings[cls][i].p2` |
| 9 | ラウンド確定 | `#submitBtn_{cls}` | 現在ラウンドを確定し次ラウンドを生成(SF #2:`pairings`→`results` への移動と新 `pairings` 生成) | `after.state.results[cls].length === before.state.results[cls].length + 1` && `after.state.pairings[cls]` 内容変化(新ラウンド) |
| 10 | ペアリング再生成 | `#repairBtn_{cls}` | 現在ラウンドの `pairings` のみを再生成(SF #2:`results` には影響しない) | `JSON.stringify(after.state.pairings[cls]) !== JSON.stringify(before.state.pairings[cls])` && `after.state.results[cls].length === before.state.results[cls].length`(results 不変) |
| 11 | 対戦相手変更保存 | `#chg-save` | 現在ラウンドの特定組の p1/p2 を変更 | `after.state.pairings[cls][i].p1 !== before.state.pairings[cls][i].p1 \|\| after.state.pairings[cls][i].p2 !== before.state.pairings[cls][i].p2` |
| 12 | 過去対局勝者変更 | `#ep-p1` / `#ep-p2`(モーダル内) | 確定済みラウンドの勝者を変更(SF #2:`results[rr][mm].winner` を変更) | `after.state.results[cls][rr][mm].winner !== before.state.results[cls][rr][mm].winner` |
| 13 | 名前一括編集保存 | `#bulk-save` | 複数参加者の名前を一括変更 | `after.state.players[cls].some((p, i) => p.name !== before.state.players[cls][i].name)` |
| 14 | マスタ追加 | `#me-save`(新規時、`data-mid` なし) | 過去参加者マスタに新メンバー追加 | `after.master.members.length === before.master.members.length + 1` |
| 15 | マスタ編集 | `#me-save`(既存、`data-mid` 付き) | 既存メンバーの name/yomi を変更 | `after.master.members.find(m => m.id === target_id).name !== before.master.members.find(m => m.id === target_id).name \|\| yomi 同様` |
| 16 | マスタ論理削除 | マスタ画面の削除ボタン | メンバーを tombstone 化 | `after.master.members.find(m => m.id === target_id).deleted === true` && `after.master.members.find(m => m.id === target_id).deleted_at !== null` |
| 17 | マスタインポート実行 | `#mi-run` | 貼付 JSON をマスタにマージ(既存側優先 + tombstone OR) | `after.master.members.length >= before.master.members.length`(マージ結果) + 既存 member 不変検証 |
| 18 | 大会データコピー | `#saveBtn` | 現在の state をクリップボードに JSON 退避 | `JSON.parse(await navigator.clipboard.readText())` の主要キーが `before.state` と一致(state は変わらないが clipboard が primary) |
| 19 | 読み込み実行(貼付) | `#load-from-paste` | 貼付 JSON で state を置換 | `JSON.stringify(after.state) !== JSON.stringify(before.state)` && `after.state.players` が貼付 JSON と一致 |
| 20 | 読み込み実行(ファイル) | `#load-pick-file` 経由 | ファイルから state を復元 | 上記 #19 と同様 |
| 21 | リセット | `#resetBtn` | state を初期化(SF #2 補足:master は温存、L0 §4.1) | `after.state.players.A.length === 0` && `after.state.players.B.length === 0` && `after.state.started === false` && `after.localStorage.shogi_v4 === null` && `after.localStorage.shogi_branch_master === before.localStorage.shogi_branch_master`(master 不変) |
| 22 | 報告書ダウンロード(SF #1 統一) | `#downloadReportBtn` | 月例運営報告書を PDF 出力 | **以下のいずれか** ①`window.print` を spy 化して呼び出し検証 ②PDF Blob URL 生成検証(`URL.createObjectURL` spy) ③anchor `download` 属性発火検証(実装方式に応じて Stage 2a 実装着手時に確定)。補助:報告書 DOM(`#report-print-area` 等)生成確認 |

**注**:#22 の確定は Stage 2a 実装着手時に `shogi_v4.html` の `printResults()` 実装を grep し、`window.print()` 直接呼び出しか PDF Blob 経由かを確認してから決める。両対応の helper を実装する案も可。

操作番号は L0 §1.5 P0 と整合(P0 19 操作 + クラス選択を A/B に分割で実質 22 行)。

### 3.5 新規操作追加ルール(A-T spec v1.3 §4.3.8 から転記)

A-7 / A-8 / A-9 等で新規 click 操作を追加する場合、以下を必須とする:

1. **操作名を §3.4 primary assertion カタログに追加**(カタログにない操作のテストを書くことを禁止)
2. **操作の業務目的を 1 文で記載**(「ユーザーは何を達成したいのか」)
3. **primary semantic assertion を state / DOM / 永続化 / URL のいずれかで最低 1 つ定義**
4. **L0 §1.5 P0 に該当する場合、通知表示のみを成功条件にしない**
5. **既存カテゴリに当てはまらない場合は、Stage 着手前に ChatGPT / Codex レビューへ回す**

判定責任:
- **新規操作の業務目的整理**:Claude.ai(仕様書段階)
- **primary assertion の妥当性確認**:ChatGPT メタレビュー
- **カタログ反映と実装**:Claude Code(Stage 着手時)
- **PR レビューでの抜け検出**:Codex(v1.2.5 §13.4 YAML フォーマットで機械検証)

### 3.6 P0/P1/P2 の Stage 適用範囲(SF #3 吸収、L0 §1.5 と接続)

L0 §1.5 で P0/P1/P2 に分類された 33 操作の Stage 別扱いを明確化:

| 優先度 | 操作数 | Stage 2a 扱い | Stage 2b 扱い | Stage 2c 扱い |
|---|---|---|---|---|
| P0(業務停止・データ破壊) | 19 操作 | **カタログ完備必須**(§3.4) + サンプル 1 件で動作確認 | A-4.2 関連を `clickAndExpectChange` で置換 | 残り P0 を全置換 |
| P1(表示状態・モーダル) | 11 操作 | 仕様書末尾に列挙のみ(後段の起点) | DOM 表示変化 assertion を原則必須で置換 | - |
| P2(印刷 / ファイル選択 / クリップボード) | 3 操作 | 検証方針(stub/spy)を §3.4 #22 で先行明示 | - | spy / stub / Playwright API 代替で実装 |

これにより、Stage 2a で全部やろうとして肥大化することを防ぐ。

---

## 4. 実装計画

### 4.1 ファイル配置

```
test/
├── helpers/
│   ├── expectClickable.js              # 新規(§3.1)
│   ├── clickAndExpectChange.js         # 新規(§3.2、getStateSnapshot 含む)
│   ├── shogi_assertions.js             # 新規(§3.4 カタログをコード化、後述 §4.3)
│   └── __tests__/
│       ├── expectClickable.test.js     # 新規(§5.1)
│       └── clickAndExpectChange.test.js # 新規(§5.1)
└── e2e/
    └── sample/
        └── at_stage_2a_sanity.spec.js  # 新規(§5.2、サンプル 1 件)
```

既存ファイルの変更は無し(Stage 2b 以降で実施)。

### 4.2 命名規則

- ヘルパ関数:キャメルケース(`expectClickable`、`clickAndExpectChange`、`getStateSnapshot`)
- カタログ関数:`assert<操作名>` 形式(例:`assertParticipantAdded`、`assertClassSelected`、`assertRoundConfirmed`)
- ヘルパ単体テスト:Jest または Playwright Test の `test()` で `expectClickable: <検証内容>` の命名

### 4.3 shogi_assertions.js の構造(§3.4 をコード化)

```javascript
// test/helpers/shogi_assertions.js
const { expect } = require('@playwright/test');

const shogiAssertions = {
  // #1 参加者追加
  participantAdded: (cls) => async (before, after) => {
    expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
  },

  // #2/#3 クラス選択(過去参加者)
  classSelectedFromPast: (cls) => async (before, after) => {
    expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
    expect(after.state.players[cls].at(-1).cls).toBe(cls);
  },

  // #4/#5 クラス選択(サジェスト)
  classSelectedFromSuggest: (cls, expectedMemberId) => async (before, after) => {
    expect(after.state.players[cls].length).toBe(before.state.players[cls].length + 1);
    expect(after.state.players[cls].at(-1).cls).toBe(cls);
    expect(after.state.players[cls].at(-1).member_id).toBe(expectedMemberId);
  },

  // #6 対局開始(タブ遷移を伴う業務目的)
  tournamentStarted: () => async (before, after) => {
    expect(after.state.started).toBe(true);
    expect(after.activeTab).toBe('tab-tournament');
    expect(after.state.pairings.A.length + after.state.pairings.B.length).toBeGreaterThan(0);
  },

  // #7/#8 勝者ボタン
  winnerSelected: (cls, matchIndex, position) => async (before, after) => {
    const expectedWinner = before.state.pairings[cls][matchIndex][position];
    expect(after.state.pairings[cls][matchIndex].winner).toBe(expectedWinner);
  },

  // #9 ラウンド確定
  roundConfirmed: (cls) => async (before, after) => {
    expect(after.state.results[cls].length).toBe(before.state.results[cls].length + 1);
    // 新ラウンドの pairings が生成されている
    expect(JSON.stringify(after.state.pairings[cls]))
      .not.toBe(JSON.stringify(before.state.pairings[cls]));
  },

  // #10 ペアリング再生成(results 不変)
  pairingsRegenerated: (cls) => async (before, after) => {
    expect(JSON.stringify(after.state.pairings[cls]))
      .not.toBe(JSON.stringify(before.state.pairings[cls]));
    expect(after.state.results[cls].length).toBe(before.state.results[cls].length);
  },

  // #11 対戦相手変更保存
  opponentChanged: (cls, matchIndex) => async (before, after) => {
    const beforeMatch = before.state.pairings[cls][matchIndex];
    const afterMatch = after.state.pairings[cls][matchIndex];
    expect(afterMatch.p1 !== beforeMatch.p1 || afterMatch.p2 !== beforeMatch.p2).toBe(true);
  },

  // #12 過去対局勝者変更
  pastWinnerChanged: (cls, round, matchIndex) => async (before, after) => {
    expect(after.state.results[cls][round][matchIndex].winner)
      .not.toBe(before.state.results[cls][round][matchIndex].winner);
  },

  // #13 名前一括編集保存
  bulkNamesEdited: (cls) => async (before, after) => {
    const changed = after.state.players[cls].some(
      (p, i) => p.name !== before.state.players[cls][i].name
    );
    expect(changed).toBe(true);
  },

  // #14 マスタ追加
  masterMemberAdded: () => async (before, after) => {
    expect(after.master.members.length).toBe(before.master.members.length + 1);
  },

  // #15 マスタ編集
  masterMemberEdited: (targetId) => async (before, after) => {
    const beforeMember = before.master.members.find(m => m.id === targetId);
    const afterMember = after.master.members.find(m => m.id === targetId);
    const changed = afterMember.name !== beforeMember.name
                 || afterMember.yomi !== beforeMember.yomi;
    expect(changed).toBe(true);
  },

  // #16 マスタ論理削除
  masterMemberDeleted: (targetId) => async (before, after) => {
    const member = after.master.members.find(m => m.id === targetId);
    expect(member.deleted).toBe(true);
    expect(member.deleted_at).not.toBeNull();
  },

  // #17 マスタインポート実行
  masterImported: (expectedMinNewCount = 0) => async (before, after) => {
    expect(after.master.members.length)
      .toBeGreaterThanOrEqual(before.master.members.length + expectedMinNewCount);
  },

  // #18 大会データコピー(clipboard primary)
  tournamentDataCopied: (page) => async (before, after) => {
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const parsed = JSON.parse(text);
    expect(parsed.players).toEqual(before.state.players);
  },

  // #19/#20 読み込み実行
  stateLoaded: (expectedPlayersA, expectedPlayersB) => async (before, after) => {
    expect(JSON.stringify(after.state)).not.toBe(JSON.stringify(before.state));
    if (expectedPlayersA) expect(after.state.players.A.length).toBe(expectedPlayersA);
    if (expectedPlayersB) expect(after.state.players.B.length).toBe(expectedPlayersB);
  },

  // #21 リセット(master 不変が重要)
  stateReset: () => async (before, after) => {
    expect(after.state.players.A.length).toBe(0);
    expect(after.state.players.B.length).toBe(0);
    expect(after.state.started).toBe(false);
    expect(after.localStorage.shogi_v4).toBeNull();
    // master は温存
    expect(after.localStorage.shogi_branch_master)
      .toBe(before.localStorage.shogi_branch_master);
  },

  // #22 報告書ダウンロード(SF #1、実装方式は Stage 2a 着手時に確定)
  reportDownloaded: (page, mode = 'window-print') => async (before, after) => {
    if (mode === 'window-print') {
      // window.print が呼び出されたことを spy で検証(spy は page.exposeFunction で事前注入)
      const printCalled = await page.evaluate(() => window.__printCalled === true);
      expect(printCalled).toBe(true);
    } else if (mode === 'pdf-blob') {
      // PDF Blob URL が生成されたことを検証
      const blobCreated = await page.evaluate(() => window.__blobCreated === true);
      expect(blobCreated).toBe(true);
    } else if (mode === 'anchor-download') {
      // anchor の download 属性発火を検証
      const downloadTriggered = await page.evaluate(() => window.__downloadTriggered === true);
      expect(downloadTriggered).toBe(true);
    }
  },
};

module.exports = { shogiAssertions };
```

### 4.4 ChatGPT v1.1 再レビュー Should Fix の吸収

| Should Fix | 吸収箇所 | 内容 |
|---|---|---|
| #1 報告書 assertion 統一 | §3.4 #22 + §4.3 `reportDownloaded` | 3 モード(window-print / pdf-blob / anchor-download)を Stage 2a 実装着手時に実装方式確認の上で確定 |
| #2 pairings/results 用語整理 | §3.4 #9/#10/#12 + §4.3 各 assertion | `pairings` = 現在ラウンド未確定、`results` = 確定済み履歴、`results[cls].length` = 確定済みラウンド数、`#repairBtn` は pairings のみ、過去対局編集は results を変更、を assertion に明記 |
| #3 P0/P1/P2 Stage 適用範囲 | §3.6 表 | Stage 2a/2b/2c 別の扱いを明確化 |

---

## 5. テスト計画

### 5.1 ヘルパ単体テスト

`test/helpers/__tests__/` 配下に Playwright Test ベースで以下を実装。

#### `expectClickable.test.js`

| テスト名 | 期待動作 |
|---|---|
| 物理的に存在しない要素で赤 | `await expect(locator).toBeAttached()` で fail |
| 不可視要素で赤 | `toBeVisible()` で fail |
| 無効化要素で赤 | `toBeEnabled()` で fail |
| `pointer-events: none` で赤 | CSS 計算値検証(段階 4)で fail |
| `opacity: 0.3` で赤 | 同上(>= 0.5 必須) |
| 祖先 `display: none` で赤 | ancestor chain 検証(段階 5)で fail |
| 祖先 `inert` で赤 | 同上 |
| 中央 1 点が overlay でブロックされる場合に赤 | 5 点 hit-test(段階 6)で fail |
| 角の 1 点が overlay でブロックされる場合に赤 | 同上 |
| 全条件クリアで緑 | 全段階 pass |

特に重要:**A-4.2 の偽陽性パターン(`pointer-events: none` で `onClick` だけ発火)を `expectClickable` が確実に赤にすることを証明**。

#### `clickAndExpectChange.test.js`

| テスト名 | 期待動作 |
|---|---|
| primary assertion を含む `expectedChange` で緑 | クリック後の状態変化を検証して pass |
| `expectedChange` 内で何も assert しない場合の挙動 | 仕様上は緑になる(Playwright の標準挙動) |
| `expectedChange` 内で意図的に失敗させた場合に赤 | テスト全体が fail |
| `expectClickable` が失敗した場合、`expectedChange` は呼ばれない | クリックが実行されないことを spy で確認 |
| `getStateSnapshot` が `state` / `master` / `localStorage` / `url` / `activeTab` をすべて取得 | スナップショットの構造を検証 |

### 5.2 サンプル e2e テスト 1 件

`test/e2e/sample/at_stage_2a_sanity.spec.js` で **L0 §1.5 P0 #1 参加者追加 を `clickAndExpectChange` 経由で実行**。

```javascript
const { test, expect } = require('@playwright/test');
const { clickAndExpectChange } = require('../../helpers/clickAndExpectChange');
const { shogiAssertions } = require('../../helpers/shogi_assertions');

test.describe('A-T Stage 2a sanity', () => {
  test('参加者追加が clickAndExpectChange + primary assertion で緑になる', async ({ page }) => {
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

  test('primary assertion なしの偽陽性テストが書けないことの確認(意図的に空 expectedChange)', async ({ page }) => {
    await page.goto('/shogi_v4.html');
    // expectedChange 内で何も assert しない場合、Playwright の標準挙動として
    // テストは緑になるが、これは「意図的にバグを通す書き方」であり、
    // Codex/ChatGPT のレビューで検出される対象。
    // 本テストは「ヘルパが何もしないという仕様」を文書化する目的で残す。
    await clickAndExpectChange(
      page.locator('#inp-name'),  // 入力欄もクリック可能
      async () => {}              // primary assertion なし
    );
  });
});
```

---

## 6. 完了基準

A-T spec v1.3 §Stage 2a 完了基準に従う + 本仕様書追加項目:

- ✅ `expectClickable` ヘルパが §3.1 の 7 段階検証すべてを実装
- ✅ `clickAndExpectChange` ヘルパが §3.2 の 5 ステップ + primary semantic assertion 必須化を実装
- ✅ `getStateSnapshot` が L0 §4.1 の 3 LocalStorage キーすべて + state + master + url + activeTab を取得
- ✅ `shogi_assertions.js` に §3.4 の 22 行(L0 P0 19 操作 + サジェスト分割)が完備
- ✅ §3.5 新規操作追加ルールが仕様書に明記
- ✅ ヘルパ単体テスト(§5.1):合計 15 件以上、全件緑
- ✅ サンプル e2e テスト(§5.2):2 件全件緑
- ✅ リポジトリ全体の `force: true` 使用箇所がゼロ(grep 検証、Stage 1 で既達確認済み、本 Stage で再確認)
- ✅ 既存 e2e 124 テスト(130 click)に影響なし(全件緑のまま)
- ✅ Codex フェーズ境界レビュー A 以上

---

## 7. 受け入れ基準

- 本仕様書が ChatGPT メタレビュー A- 以上
- 実装後、Codex フェーズ境界レビュー A 以上
- DevSecOps v1.2.5 §13 段階 1 自動マージ範囲(test/typo/docs)に該当(コード変更は test/ 配下のみ、production コード `shogi_v4.html` への変更なし)
- A-T spec v1.3 §6 受け入れ基準と整合

---

## 8. リスクと緩和

| リスク | 影響 | 緩和策 |
|---|---|---|
| `getStateSnapshot` が重く、e2e 全体時間が増加 | CI 時間増 | `JSON.parse(JSON.stringify(state))` の deep clone コストを計測、必要なら shallow clone + 主要キーのみに限定 |
| `expectClickable` の 7 段階検証で正常な要素まで fail する偽陽性 | テスト不安定化 | ヘルパ単体テスト(§5.1)で正常パターン緑を証明、Stage 2b 置換時にも漸進的に検証 |
| `shogi_assertions.js` カタログが Stage 2b 置換時に不足判明 | Stage 2b で再修正 | §3.5 新規操作追加ルールに従い、不足分はカタログに追加 |
| `#22` 報告書ダウンロードの実装方式が想定と異なる | カタログ修正 | Stage 2a 実装着手時に `printResults()` 関数本体を grep で先行確認、3 モードのうち適切なものを選択 |

---

## 9. 参照

- A-T 仕様書 v1.3:`docs/specs/20260506_0105_shogi_at_spec_v1_3.md`
- A-T Stage 1 完了レポート:`docs/specs/20260506_0116_shogi_at_stage1_falsepositive_report.md`
- L0 業務モデル文書 v1.1:`docs/specs/_business_model.md`(commit a5fda4a)
- DevSecOps 運用方針 v1.2.5:shogi-coach `docs/specs/zero_bug_declaration_v1_2_5.md`
- ChatGPT v1.1 再レビュー結果(本セッション内、Should Fix #1〜#3 を §3.4/§3.6/§4.4 で吸収)

---

**END**
