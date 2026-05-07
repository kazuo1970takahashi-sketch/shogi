# shogi A-4.6 エントリー済ボタン色強調復活 Mini 仕様書 v1

**作成日時**: 2026-05-07 23:33 JST
**ベース commit**: `cf7a970`(A-4.5 マージ後)
**想定工数**: 1〜2 時間
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**規模**: 軽量(production diff 約 +15 / -5 行想定)

---

## §0 ユーザーストーリー

- **US-1(受付者)**: 過去参加者パネルでエントリー済の参加者を見たとき、「A クラスに登録済みの人」と「B クラスに登録済みの人」が **ボタンの色** で一目で分かる。セクション位置 + ボタン色の二重視覚言語で確実に把握できる。
- **US-2(受付者)**: A/B ボタンをタップしてエントリーした瞬間、対応するボタンが色付きに変わるので、「自分が今選んだクラスはこれ」という即時フィードバックが得られる。

---

## §1 背景・課題

A-4.5 main マージ後の実機テストで、髙橋さんから指摘:

> AB ボタンは選択したら色が変わるなどの工夫が欲しい。タップすればテキストは変わるし、エントリー場所の移動もあるが、ユーザーが選択したものがどれかが分かりにくい。

A-4.5 では色強調(`pp-add-btn-active`、`pp-add-btn-highlight`)を撤廃し、視覚言語を「セクション位置」のみに一本化した。しかし実運用では:

- セクション間移動の動きが小さく、押下フィードバックとして弱い
- スクロール位置によってはセクション移動先が見えない場合がある
- 「自分が今押した側のボタン」が即時に視覚的に確定しない

A-4.4 で「現在:Xクラス」テキストを行内追加したが、これは **行内要素の増加で iPhone 375px の flex 破綻**を招き revert された。A-4.6 では **行内要素を増やさず、ボタンの style(背景色 + 文字)だけ変更** することで、レイアウト破綻リスクなしに視覚フィードバックを強化する。

---

## §2 機能仕様

### 2.1 エントリー済の現クラスボタンに色強調復活

| ボタン状態 | 背景色 | 文字色 | テキスト | font-weight |
|---|---|---|---|---|
| A 登録済の **A ボタン** | `#bbdefb`(薄青) | `#0d47a1`(濃青) | `A ✓` | bold |
| B 登録済の **B ボタン** | `#ffe0b2`(薄橙) | `#5d4037`(濃茶) | `B ✓` | bold |
| 上記以外(未エントリー / 別クラスボタン) | `#fff`(白) | `#1976d2`(青) | `A` or `B` | normal |

- ボーダー色も A=濃青 / B=濃橙に変更してセクション識別を強化
- `pp-add-btn-active` クラスを復活(e2e で active 状態を locate するため)

### 2.2 行内要素は変えない(A-4.5 維持)

- 行 2 段レイアウト(1 段目=氏名+A/B、2 段目=ふりがな+前回:Xクラス+日付)維持
- 「現在:Xクラス」テキストは **追加しない**(A-4.4 失敗の再発防止)
- 行のサイズ・min-width 構成は A-4.5 と同じ

### 2.3 前回参加クラス強調(`pp-add-btn-highlight`)は撤廃のまま維持

A-4.5 で撤廃した薄琥珀色 highlight は復活しない:
- 前回参加クラスは **2 段目の「前回:Xクラス」テキスト**(色なし)で表現
- 現クラス active(色付き)だけが視覚言語として成立
- 二重ハイライトによる混乱(A-4.3 までの問題)を回避

---

## §3 実装方針

### 3.1 buildPastParticipantsPanelHtml の renderPpRow 修正

```javascript
// A-4.6 §2.1: 現クラス active のみ復活(highlight は撤廃のまま)
var currentCls = currentRegMap[fm.id] || null;
var aActive = (currentCls === 'A');
var bActive = (currentCls === 'B');

var btnBaseStyle = 'min-width:44px;min-height:44px;margin-left:8px;border-radius:6px;font-size:14px;cursor:pointer;flex-shrink:0';
var aStyle = btnBaseStyle
  + ';font-weight:' + (aActive ? 'bold' : 'normal')
  + ';background:' + (aActive ? '#bbdefb' : '#fff')
  + ';color:' + (aActive ? '#0d47a1' : '#1976d2')
  + ';border:1px solid ' + (aActive ? '#0d47a1' : '#1976d2');
var bStyle = btnBaseStyle
  + ';font-weight:' + (bActive ? 'bold' : 'normal')
  + ';background:' + (bActive ? '#ffe0b2' : '#fff')
  + ';color:' + (bActive ? '#5d4037' : '#1976d2')
  + ';border:1px solid ' + (bActive ? '#e65100' : '#1976d2');

var aClass = 'pp-add-btn' + (aActive ? ' pp-add-btn-active' : '');
var bClass = 'pp-add-btn' + (bActive ? ' pp-add-btn-active' : '');
var aText = aActive ? 'A ✓' : 'A';
var bText = bActive ? 'B ✓' : 'B';
```

### 3.2 ハンドラ・判定ロジックは変更なし

`handlePastParticipantClassAdd` / `handleSuggestClassAdd` の 3 ケース判定、`changePlayerClass` 関数、F7 編集モーダル、bug fix #7 はすべて A-4.5 のまま維持。

### 3.3 e2e 修正

**新規 a4_6 spec.js**(または a4_5 spec.js に §2.8 として追記):
1. A 登録済の A ボタンに `pp-add-btn-active` クラス + 背景色 #bbdefb + テキスト「A ✓」
2. B 登録済の B ボタンに `pp-add-btn-active` クラス + 背景色 #ffe0b2 + テキスト「B ✓」
3. 未エントリー行の両ボタンに active クラスなし、テキストは「A」「B」のみ
4. A 登録済の B ボタンには active クラスなし(別クラスは強調しない)

**a4_5 spec.js の更新**:
- §2.1「ボタン色強調撤廃」テスト → **削除**(色強調復活のため)
- §2.1「行内要素は A-4.3 と同じ」テスト → 維持(`pp-current-class` 不在は変わらず)
- §4 #6「iPhone 375px 縦書き化なし」テスト → 維持(行内要素変えないので影響なし)

**a4_3 spec.js の更新**:
- §2.1 で A-4.4 / A-4.5 で削除した「現クラス強調」4 件のうち、**active 検証 3 件は復活**(highlight 検証は復活しない)

### 3.4 visual regression snapshot 更新

- `visual_regression_mobile.spec.js` の `mobile-pp-panel-3sections` snapshot をボタン色付きで更新(`--update-snapshots`)
- `visual_regression.spec.js` の chromium-desktop snapshot も更新
- F7 編集モーダル snapshot は変更なし(F7 は触らない)

---

## §4 受け入れ条件

1. エントリー済セクションの A 登録済の A ボタンに背景色 #bbdefb + テキスト「A ✓」+ `pp-add-btn-active` クラス
2. エントリー済セクションの B 登録済の B ボタンに背景色 #ffe0b2 + テキスト「B ✓」+ `pp-add-btn-active` クラス
3. 未エントリーセクションの両ボタンに色なし・「A」「B」のみ
4. エントリー済セクションの **別クラスボタン**(A 登録済の B ボタン等)に色なし
5. 行内要素は A-4.5 と同じ(「現在:Xクラス」テキストは追加されていない)
6. iPhone 375px で行レイアウトが破綻しない(2 段表示維持)
7. 既存 + 新規 e2e すべて緑(visual regression は --update-snapshots で更新)
8. mobile-375 visual snapshot がボタン色付きで更新されている
9. 単体テスト緑(npm test)
10. iPhone 実機目視確認(髙橋さん作業、本仕様書範囲外)
11. Codex Gate Review A 判定(本仕様書範囲外)

---

## §5 リスク・移行戦略

- 行内要素を変えないので mobile レイアウト破綻リスクなし
- A-4.4 失敗の真因は「行内要素追加」だったので、本案件はその轍を踏まない
- mobile-375 VRT で念のため検証

---

## §6 Devil's Advocate(Codex 必須質問)

1. **mobile-375 visual snapshot がボタン色付きで実際に更新されているか確認**(`ls -la` でファイル更新時刻が変更後か)
2. **ボタンサイズが背景色追加で変化していないか**:`min-width:44px; min-height:44px` を維持しているか、border 太さ変更で実効サイズが変わっていないか
3. **A → B クラス変更時の色遷移**:A 登録済の状態で B ボタンタップ → confirm OK → B 登録済へ → A ボタン色消失 + B ボタン色出現の遷移が直感的か
4. **二重視覚言語(セクション位置 + ボタン色)の整合性**:A 済セクション内で「A ボタンが色付き」「B ボタンが色なし」が常に成立するか(逆転は理論上不可能だが、再描画タイミング race などで矛盾しないか)
5. **A-4.4 の轍を踏んでいないか**:行内要素が増えていないこと、`renderPpRow` の段構造が A-4.5 と同じであることを diff で確認

---

## §7 想定外時の対応

- 実機 NG が出た場合:hotfix or revert
- 規模が小さいので revert コストは低い(diff +15/-5 程度)
