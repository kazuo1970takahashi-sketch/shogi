# shogi A-4.5 過去参加者パネル 3 セクション分離 + F7 簡素化 + bug fix #7 Mini 仕様書 v1

**作成日時**: 2026-05-07 22:53 JST
**ベース commit**: `a66f418`(A-4.4 revert 後 = A-4.3 状態と等価)
**想定工数**: 4〜6 時間
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**1 PR 1 回**

---

## §0 ユーザーストーリー

- **US-1(受付者)**: 大会受付中、過去参加者パネルを開いて来場者を A or B で受付する。エントリー済 / 未エントリーが視覚的に分離され、進捗が一目で分かる。
- **US-2(受付者)**: エントリー後、間違いに気づいて参加者のクラスを変更する。エントリー済セクション内のクラスボタンタップ → 確認 → 変更 → 該当セクションに移動。
- **US-3(受付者)**: F7 マスタ編集で前回クラスを A↔B に修正する。「未設定」状態は不要なので 2 択ラジオで簡潔に。
- **US-4(受付者)**: F7 編集で前回クラスを変更後、過去参加者パネルを開くと変更が即時反映される(リロード不要)。
- **US-5(受付者)**: iPhone 375px 幅で操作する際、行内レイアウトが崩れず、氏名が読める状態で表示される。

---

## §1 背景・課題

### 1.1 A-4.4 失敗の教訓

A-4.4(2 セクション分離 + 「現在:Xクラス」テキスト追加)は Codex Gate Review A 判定取得後 main マージしたが、**iPhone 375px 幅で行レイアウトが破綻**し、氏名が縦書き化する P0 障害が発覚 → revert(`a66f418`)。

根因:
- 行内要素を A-4.3 から増やした(「現在:Xクラス」テキスト追加)
- iPhone 375px の `flex:1; min-width:0; overflow-wrap:anywhere` 氏名 span が極端に圧縮され折り返し連鎖
- visual regression e2e は **chromium-desktop 1280px** のみ撮影、**mobile-375 の過去参加者パネル展開状態の snapshot が無かった**ため検出漏れ

### 1.2 解決方針

「現クラス」を **行内要素ではなく、セクション位置で表現**する:

- **3 セクション分離**:「Aクラスエントリー済」「Bクラスエントリー済」「未エントリー」
- 行内要素は A-4.3 と同じ(氏名 + 前回:Xクラス + 日付 + A/B ボタン)→ レイアウト破綻ゼロ
- ボタン色強調(active / highlight)を撤廃 → 視覚言語はセクション位置に一本化
- iPhone 375px の visual regression snapshot を必須化(再発防止)

### 1.3 維持する変更(A-4.4 から)

- F7「未設定」radio 削除(A/B 2 択化)
- F7 保存後の過去参加者パネル再描画(bug fix #7)

---

## §2 機能仕様

### 2.1 過去参加者パネル 3 セクション分離

**構造**:

```
[検索・フィルタ UI]                            (現状維持)
[ヒント: 追加先を選択(A/B...)]                 (現状維持)

▼ Aクラスエントリー済 (2名)
  [行: 氏名 + 前回:Bクラス + 2026-05-07 + A + B]
  ...
▼ Bクラスエントリー済 (1名)
  [行: 氏名 + 前回:Bクラス + 2026-05-07 + A + B]
  ...
▼ 未エントリー (6名)
  [行: 氏名 + 前回:Bクラス + 2026-05-07 + A + B]
  ...
```

**ソート**:
- 全セクションとも yomi 五十音順(現状維持)

**セクションヘッダ**:
- 「**Aクラスエントリー済 (N 名)**」「**Bクラスエントリー済 (M 名)**」「**未エントリー (L 名)**」
- フィルタ適用時はフィルタ後の件数
- 件数 0 のセクションは「**該当なし**」と表示(セクション自体は描画維持)

**検索・クイックフィルタ動作**:
- 既存フィルタ(氏名検索 / あかさたな / 前回参加 / 3 ヶ月以内 / 常連 / ふりがな未入力)はそのまま機能
- **3 セクション横断**でフィルタ

### 2.2 行表示(全セクション共通、A-4.3 と同じ)

- 氏名(現状維持)
- 前回:Bクラス + 日付(現状維持、色なしテキスト)
- A / B ボタン(両方とも通常サイズ・通常色、強調撤廃)

**「現在:Xクラス」テキストは追加しない**(セクション位置で示すため不要)。

### 2.3 ボタンタップ動作(A-4.3 と同じ 3 ケース判定)

state.players ベースで判定(セクション分離はあくまで UI):
- **未エントリーの A/B**: ケース 1 confirm「○○さんを A クラスに追加しますか?」→ OK で state.players 追加
- **エントリー済の現クラス再タップ**: ケース 3 alert「既に Aクラスに登録されています」
- **エントリー済の別クラスタップ**: ケース 2 confirm「現在 A クラス / B クラスに変更しますか?」→ OK で changePlayerClass

### 2.4 ボタン色強調撤廃

- `pp-add-btn-active` クラス削除(現クラス強調)
- `pp-add-btn-highlight` クラス削除(前回参加クラス強調、薄琥珀色 #FFD580)
- 「✓」マーク撤廃
- ボタン色は全て同じ(白背景・青ボーダー・青文字)

### 2.5 サジェスト UI(変更なし)

サジェストドロップダウン + 3 ケース確認ダイアログは現状維持。

### 2.6 F7 編集モーダル 簡素化(A-4.4 と同じ)

**変更前(A-4.3)**: 前回クラス fieldset = A / B / 未設定 の 3 ラジオ
**変更後(A-4.5)**: 前回クラス fieldset = A / B の 2 ラジオ

- value="" radio 削除
- last_class が null の member の場合、A/B どちらも未 checked 状態で開く
- 何も選ばずに保存 → options.last_class undefined → 既存値(null)維持
- A or B を選んで保存 → applyMasterMemberEdit で更新
- バリデーション: `'A' | 'B'` のみ受理(`null` は不正)

### 2.7 F7 保存後の過去参加者パネル再描画(bug fix #7、A-4.4 と同じ)

`bindMasterEditModalEvents` の保存成功処理に以下 1 行追加:

```javascript
// A-4.5 §2.7 (bug fix #7): F7 保存後に過去参加者パネルを再描画(リロード不要)
if (typeof renderPastParticipantsPanel === 'function') {
  var ppSearch = document.getElementById('pp-search');
  renderPastParticipantsPanel(ppSearch ? ppSearch.value : '');
}
```

---

## §3 実装方針

### 3.1 buildPastParticipantsPanelHtml の改修

**現状(A-4.3)**: 1 つの flat list で member を全件描画。

**A-4.5**: filtered 配列を 3 つに分割して 3 セクション描画。

```javascript
// currentRegMap は A-4.3 で導入済(state.players → member_id → 'A'|'B' のマップ)
var aEnrolledFiltered = filtered.filter(m => currentRegMap[m.id] === 'A');
var bEnrolledFiltered = filtered.filter(m => currentRegMap[m.id] === 'B');
var notEnrolledFiltered = filtered.filter(m => !currentRegMap[m.id]);

// 行描画 helper(全セクション共通、A-4.3 と同じ要素構成)
function renderPpRow(fm) {
  // 氏名 + 前回:Xクラス + 日付 + A/B ボタン(色強調なし)
}

// セクション描画 helper
function renderSection(headerLabel, list, cssClass) {
  var html = '<div class="pp-section ' + cssClass + '">';
  html += '<div class="pp-section-header">' + headerLabel + ' (' + list.length + '名)</div>';
  if (list.length === 0) {
    html += '<div class="pp-empty">該当なし</div>';
  } else {
    for (var i = 0; i < list.length; i++) html += renderPpRow(list[i]);
  }
  html += '</div>';
  return html;
}

html += renderSection('Aクラスエントリー済', aEnrolledFiltered, 'pp-section-a-enrolled');
html += renderSection('Bクラスエントリー済', bEnrolledFiltered, 'pp-section-b-enrolled');
html += renderSection('未エントリー', notEnrolledFiltered, 'pp-section-not-enrolled');
```

### 3.2 ボタン色強調撤廃

- `aActive` / `bActive` 計算撤廃
- `aHighlight` / `bHighlight` 計算撤廃
- `aText` / `bText` で「A ✓」を「A」に統一
- `aStyle` / `bStyle` はベーススタイル(白背景・青ボーダー)のみ
- `aClass` / `bClass` の `pp-add-btn-active` `pp-add-btn-highlight` 追加撤廃

### 3.3 ハンドラ動作の判定簡素化

`handlePastParticipantClassAdd` / `handleSuggestClassAdd` は **3 ケース判定ロジックを維持**(セクション分離はあくまで UI、判定は state.players ベース)。

### 3.4 F7 編集モーダル(A-4.4 と同じ)

`buildMasterEditModalHtml` の前回クラス fieldset から value="" radio を削除。`applyMasterMemberEdit` のバリデーションから null 受理を撤廃。

### 3.5 F7 保存後再描画(A-4.4 と同じ)

`bindMasterEditModalEvents` の保存成功処理に renderPastParticipantsPanel 呼び出し追加。

### 3.6 e2e 修正

**a4_3 spec.js の修正**:

| # | 既存テスト | 変更内容 |
|---|---|---|
| §2.1 | 現クラス強調 4 件(`pp-add-btn-active`, `✓`) | **削除**(色強調撤廃のため) |
| §2.2 | 確認ダイアログ 3 ケース | **維持**(判定ロジック不変) |
| §2.4 | マスタ一覧 last_class カラム | **維持** |
| §2.5 #1 | F7 「前回クラス」fieldset 表示 | **書き換え**(3 radio → 2 radio) |
| §2.5 #2 | last_class=null → 「未設定」初期選択 | **書き換え**: A/B どちらも未 checked |
| §2.5 #3 | A → B 変更 | **維持** |
| §2.5 #4 | 未設定 → null | **書き換え**: A/B 未選択保存 → null 維持 |
| §2.5 補強 | radio 3 つ DOM 存在 | **書き換え**: radio 2 つ DOM 存在 + value="" 不在 |
| §3.1 | changePlayerClass 純粋関数 | **維持** |

**a4_2 spec.js の修正**:

| # | 既存テスト | 変更内容 |
|---|---|---|
| 過去参加者パネル highlight 系 2 件 | **削除**(撤廃済み機能) |
| サジェスト highlight 系 | **維持**(サジェスト UI は変更なし) |

**新規 a4_5 spec.js**:
1. 3 セクション分離(Aクラス済 / Bクラス済 / 未エントリー)
2. 各セクションヘッダ件数表示
3. 「該当なし」表示(空セクション)
4. 未エントリー → A エントリー → A クラス済セクションに移動
5. A クラス済 → B 変更 → B クラス済セクションに移動(クロスセクション)
6. ボタン色強調(active / highlight)撤廃検証
7. F7 保存後の過去参加者パネル即時反映(bug fix #7)
8. 検索フィルタが 3 セクション横断
9. **iPhone 375px 行レイアウト(氏名が縦書き化しないこと)**

### 3.7 visual regression snapshot 追加(再発防止)

**既存**:
- chromium-desktop 1280px の過去参加者パネル展開状態 snapshot

**新規追加**(必須):
- **mobile-375 の過去参加者パネル展開状態 snapshot**(3 セクション + 各セクションに 1 行以上含む状態)
- mobile-375 の F7 編集モーダル snapshot(A/B 2 択 fieldset)

これにより iPhone 375px でのレイアウト破綻が e2e 段階で検出可能になる。

---

## §4 受け入れ条件

1. 過去参加者パネルが「Aクラスエントリー済 / Bクラスエントリー済 / 未エントリー」3 セクションに分離される
2. 各セクションヘッダに件数表示「(N 名)」、件数 0 は「該当なし」
3. 検索・クイックフィルタが 3 セクション横断で機能
4. ボタン色強調(現クラス active / 前回 highlight)が撤廃される
5. 行内要素は A-4.3 と同じ(氏名 + 前回:Xクラス + 日付 + A/B)
6. **iPhone 375px 幅で行レイアウトが破綻しない(氏名が縦書き化しない)**
7. F7 編集モーダルの前回クラス radio が A/B 2 択になる
8. F7 保存後、リロードなしで過去参加者パネルに反映される(bug fix #7)
9. 既存 + 新規 e2e すべて緑(visual regression は --update-snapshots で更新)
10. **mobile-375 の過去参加者パネル + F7 編集モーダル visual regression snapshot が追加されている**
11. 単体テスト緑(npm test)
12. iPhone 実機目視確認(髙橋さん作業、本仕様書範囲外)
13. Codex Gate Review A 判定(本仕様書範囲外)

---

## §5 リスク・移行戦略

- データ構造変更なし、マイグレーション不要
- F8 import/export 影響なし
- visual regression 更新範囲が大きい → `--update-snapshots` で対応
- 既存 e2e の修正範囲が広い → diff 慎重確認
- A-4.4 の失敗から、**iPhone 375px snapshot を必須化**して再発防止

---

## §6 Devil's Advocate(Codex 必須質問)

A-4.4 で「破綻可能性は低い」と Codex が判断しながら実機破綻したため、本案件では **iPhone 375px の実証的検証**を最重視する:

1. **mobile-375 visual regression snapshot が実際に追加されているか確認**(§3.7、§4 #10)。snapshot ファイルが存在することと、長氏名(10 文字以上)を含む状態で撮影されていることを確認。
2. **3 セクション空状態の UI**: 大会開始時(全員未エントリー)に Aクラス済 0 名 / Bクラス済 0 名 / 未エントリー N 名 が表示される状態の見栄え。「該当なし」が 2 つ並ぶ視覚負荷。
3. **A クラス済 → B 変更時のクロスセクション移動**: ユーザー視点で「行が消えた!」と感じないか。確認ダイアログ後にどのセクションに移動するかが明示されるか。
4. **F7 保存後の再描画 race**: A-4.4 と同じく `renderMasterTab()` 直後に `renderPastParticipantsPanel()` を呼ぶ順序の妥当性。
5. **A-4.4 e2e の差分管理(削除/書き換え/維持)**: A-4.4 で削除した a4_3 spec の §2.1、a4_2 spec の highlight 系は本仕様でも削除継続で良いか。新規 a4_5 spec での代替検証が同等以上か。
6. **行内要素の幅見積もり**: iPhone 375px で「山田太郎(10 文字相当)+ 前回:Bクラス + 2026-05-07 + 44x44 ボタン x 2」が破綻しないことの数値根拠(min-width 計算)。

---

## §7 想定外時の対応

- 実機 NG が出た場合(再びレイアウト破綻):main hotfix or revert
- A-4.3 / A-4.4 と同様、PR は draft で作成し Codex A 判定 + 実機確認 OK 後にマージ
- **実機確認は通常タブ(プライベートブラウズ不可、localStorage 必要)** で実施

---

## §8 A-4.4 失敗からの差分(参考)

| 項目 | A-4.4 | A-4.5 |
|---|---|---|
| セクション数 | 2 (エントリー済 / 未エントリー) | 3 (A 済 / B 済 / 未エントリー) |
| 「現在:Xクラス」テキスト | 行内追加 | 追加しない(セクション位置で示す) |
| 行内要素 | A-4.3 + 1 (現在テキスト) | A-4.3 と同じ |
| iPhone 375px visual regression | なし(発見漏れ原因) | 必須追加(再発防止) |
| F7「未設定」radio 撤廃 | あり | あり(同じ) |
| bug fix #7 | あり | あり(同じ) |
