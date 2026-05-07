# shogi A-4.4 過去参加者パネル UX 改善 + F7 編集モーダル簡素化 + bug fix Mini 仕様書 v1

**作成日時**: 2026-05-07 21:45 JST
**ベース commit**: `ba76473`(A-4.3 main マージ後)
**想定工数**: 4〜6 時間
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)
**1 PR 1 回**

---

## §0 ユーザーストーリー

- **US-1(受付者)**: 大会受付中、過去参加者パネルを開いて来場者を A or B で受付する。エントリー済 / 未エントリーが視覚的に分離され、進捗(N 名)が一目で分かる。
- **US-2(受付者)**: エントリー後、間違いに気づいて参加者のクラスを変更する。エントリー済セクション内のクラスボタンタップ → 確認 → 変更。
- **US-3(受付者)**: F7 マスタ編集で前回クラスを A↔B に修正する。「未設定」状態は不要なので 2 択ラジオで簡潔に。
- **US-4(受付者)**: F7 編集で前回クラスを変更後、過去参加者パネルを開くと変更が即時反映される(リロード不要)。

---

## §1 背景・課題

A-4.3 main マージ後の実機テストで以下の課題が判明:

1. **エントリー済 vs 未エントリーが視覚的に紛らわしい**
   - 現クラス強調(濃琥珀色 + ✓)と前回参加クラス強調(薄琥珀色)が同系統色
   - 説明されないと意味が伝わらないレベル(髙橋さん指摘)
   - 受付フローのメンタルモデル(未エントリー → エントリー)が UI に現れていない

2. **F7「未設定」radio が実運用で不要**(髙橋さん指摘)
   - last_class が null になる業務シナリオなし(state.players → syncBranchMasterOnSave で自動更新)
   - A-4.3 の Devil's Advocate 質問 5-c で「null 戻し手段」と判断したが過剰

3. **F7 保存後に過去参加者パネル再描画が呼ばれない bug**(髙橋さん指摘 #7)
   - F7 で last_class 変更 → マスタは保存される(リロードで反映)
   - だが過去参加者パネルの「前回:Aクラス」表示はリロードまで古いまま
   - データ破壊なし、UX 不整合のみ

### 解決方針

過去参加者パネルを **「エントリー済(上) / 未エントリー(下)」2 セクション分離** に再設計し、視覚言語を「セクション位置」で表現する。これにより色強調(現クラス active / 前回 highlight)を撤廃でき、見た目がシンプルかつ意味が明確になる。

---

## §2 機能仕様

### 2.1 過去参加者パネル 2 セクション分離

**構造**:

```
[検索・フィルタ UI]                            (現状維持)
[ヒント: 追加先を選択(A/B...)]                 (現状維持)

▼ エントリー済 (3名)
  [行: 氏名 + 現在:Aクラス + 前回:Bクラス + 日付 + A/B ボタン]
  ...
▼ 未エントリー (6名)
  [行: 氏名 + 前回:Bクラス + 日付 + A/B ボタン]
  ...
```

**ソート**:
- 両セクションとも yomi 五十音順(現状維持)

**セクションヘッダ**:
- 「**エントリー済 (N名)**」「**未エントリー (M名)**」
- フィルタ適用時はフィルタ後の件数
- 件数 0 のセクションは「**該当なし**」と表示(セクション自体は描画維持)

**検索・クイックフィルタ動作**:
- 既存フィルタ(氏名検索 / あかさたな / 前回参加 / 3 ヶ月以内 / 常連 / ふりがな未入力)はそのまま機能
- **両セクション横断**でフィルタ

### 2.2 行表示

#### エントリー済セクション

- 氏名(現状維持)
- **「現在:Aクラス」or「現在:Bクラス」テキスト表示**(新規、軽くアクセント色)
- 前回:Bクラス + 日付(現状維持、色なしテキスト)
- A / B ボタン(両方とも通常サイズ・通常色、強調撤廃)
- ボタン押下時(state.players ベース判定):
  - 現クラスと同じボタン → ケース 3 alert「既に Aクラスに登録されています」
  - 現クラスと違うボタン → ケース 2 confirm「現在 Aクラス / Bクラスに変更しますか?」

#### 未エントリーセクション

- 氏名(現状維持)
- 前回:Bクラス + 日付(現状維持、色なしテキスト)
- A / B ボタン(両方とも通常サイズ・通常色、強調撤廃)
- ボタン押下時:ケース 1 confirm「○○さんを Aクラスに追加しますか?」

### 2.3 ボタン色強調撤廃

- `pp-add-btn-active` クラス削除(現クラス強調)
- `pp-add-btn-highlight` クラス削除(前回参加クラス強調、薄琥珀色 #FFD580)
- 「✓」マーク撤廃
- ボタン色は全て同じ(白背景・青ボーダー・青文字、現状の通常色)

### 2.4 サジェスト UI(変更なし)

サジェストドロップダウン + 3 ケース確認ダイアログは現状維持。

### 2.5 F7 編集モーダル 簡素化

**変更前(A-4.3)**: 前回クラス fieldset = A / B / 未設定 の 3 ラジオ
**変更後(A-4.4)**: 前回クラス fieldset = A / B の 2 ラジオ

- value="" radio(「未設定」)を削除
- last_class が null の member の場合、A/B どちらも未 checked 状態で開く(初期表示)
- ユーザーが何も選ばずに保存 → options.last_class undefined → 既存値(null)維持
- ユーザーが A or B を選んで保存 → options.last_class = 'A' | 'B' で applyMasterMemberEdit 実行

`applyMasterMemberEdit` 内部:
- last_class undefined ケースの処理: 既存 target.last_class を保持(現状の `if(hasLastClassOpt)` 分岐で対応済)
- バリデーション: `'A' | 'B'` のみ受理(`null` は不要)

### 2.6 F7 保存後の過去参加者パネル再描画(bug fix)

`bindMasterEditModalEvents` の保存成功処理に以下 1 行追加:

```javascript
// A-4.4: F7 保存後に過去参加者パネルを再描画(リロード不要)
if (typeof renderPastParticipantsPanel === 'function') {
  var ppSearch = document.getElementById('pp-search');
  renderPastParticipantsPanel(ppSearch ? ppSearch.value : '');
}
```

---

## §3 実装方針

### 3.1 buildPastParticipantsPanelHtml の改修

**現状(A-4.3)**: 1 つの flat list で member を全件描画。各行に現クラス active / 前回 highlight ボタン。

**A-4.4**: filtered 配列を 2 つに分割して 2 セクション描画。

```javascript
// currentRegMap は既存(A-4.3 で導入)
var enrolledFiltered = filtered.filter(m => currentRegMap[m.id]);
var notEnrolledFiltered = filtered.filter(m => !currentRegMap[m.id]);

// 「エントリー済」セクション描画
html += '<div class="pp-section pp-section-enrolled">';
html += '<div class="pp-section-header">エントリー済 (' + enrolledFiltered.length + '名)</div>';
if (enrolledFiltered.length === 0) {
  html += '<div class="pp-empty">該当なし</div>';
} else {
  // 各行を描画(エントリー済用)
}
html += '</div>';

// 「未エントリー」セクション描画
html += '<div class="pp-section pp-section-not-enrolled">';
html += '<div class="pp-section-header">未エントリー (' + notEnrolledFiltered.length + '名)</div>';
if (notEnrolledFiltered.length === 0) {
  html += '<div class="pp-empty">該当なし</div>';
} else {
  // 各行を描画(未エントリー用)
}
html += '</div>';
```

行描画ロジックは inline で書いても helper 関数化しても OK(Claude Code 判断)。

### 3.2 ボタン色強調撤廃

- `aActive` / `bActive` 計算撤廃
- `aHighlight` / `bHighlight` 計算撤廃
- `aText` / `bText` で「A ✓」を「A」に統一
- `aStyle` / `bStyle` はベーススタイル(白背景・青ボーダー)のみ
- `aClass` / `bClass` の `pp-add-btn-active` `pp-add-btn-highlight` 追加撤廃

### 3.3 ハンドラ動作の判定簡素化

`handlePastParticipantClassAdd` / `handleSuggestClassAdd` は **3 ケース判定ロジックを維持**(セクション分離はあくまで UI、判定は state.players ベース)。

### 3.4 F7 編集モーダル

`buildMasterEditModalHtml` の前回クラス fieldset:

```javascript
// 変更前(A-4.3)
html+='<label ...><input type="radio" name="me-last-class" value=""'+(lastClassCur===''?' checked':'')+...>未設定</label>';
html+='<label ...><input type="radio" name="me-last-class" value="A"'+(lastClassCur==='A'?' checked':'')+...>A</label>';
html+='<label ...><input type="radio" name="me-last-class" value="B"'+(lastClassCur==='B'?' checked':'')+...>B</label>';

// 変更後(A-4.4)
html+='<label ...><input type="radio" name="me-last-class" value="A"'+(lastClassCur==='A'?' checked':'')+...>A</label>';
html+='<label ...><input type="radio" name="me-last-class" value="B"'+(lastClassCur==='B'?' checked':'')+...>B</label>';
```

`bindMasterEditModalEvents` の `lastClassPicked` 検出:
- value="" を期待しないので分岐そのまま動く(value=""の input が DOM にない → 検出されない → undefined)

`applyMasterMemberEdit` のバリデーション:
- `last_class === null` を受理しない(undefined のみが「変更しない」を意味)
- `if(hasLastClassOpt && options.last_class !== 'A' && options.last_class !== 'B')` → invalid_last_class_value

### 3.5 F7 保存後再描画

`bindMasterEditModalEvents` の保存成功処理に renderPastParticipantsPanel 呼び出し追加(§2.6 のコード参照)。

### 3.6 e2e 修正

**a4_3 spec.js の修正**:

| # | 既存テスト | 変更内容 |
|---|---|---|
| §2.1 | 現クラス強調 4 件(`pp-add-btn-active`, `✓`) | **削除**(色強調撤廃のため) |
| §2.1' | 新規 | エントリー済セクション存在検証 + 「現在:Aクラス」テキスト検証 |
| §2.2 | 確認ダイアログ 3 ケース | **維持**(判定ロジック不変) |
| §2.4 | マスタ一覧 last_class カラム | **維持** |
| §2.5 #1 | F7 「前回クラス」fieldset 表示 | **維持**(ただし 3 radio → 2 radio) |
| §2.5 #2 | last_class=null → 「未設定」初期選択 | **書き換え**: A/B どちらも未 checked |
| §2.5 #3 | A → B 変更 | **維持** |
| §2.5 #4 | 未設定 → null | **削除** |
| §2.5 補強 | radio 3 つ DOM 存在 | **書き換え**: radio 2 つ DOM 存在 |
| §3.1 | changePlayerClass 純粋関数 | **維持** |

**新規 a4_4 spec.js**:
1. エントリー済セクションヘッダ件数表示
2. 未エントリーセクションヘッダ件数表示
3. エントリー後の行移動(未エントリー → エントリー済)
4. 「該当なし」表示(片方セクションが空のとき)
5. F7 保存後の過去参加者パネル即時反映(bug fix #7 検証)
6. 「現在:Aクラス」「現在:Bクラス」テキストの色アクセント検証

### 3.7 visual regression snapshot 更新

過去参加者パネル / F7 編集モーダルが変わるので snapshot 全更新(`--update-snapshots`)。

---

## §4 受け入れ条件

1. 過去参加者パネルが「エントリー済 / 未エントリー」2 セクションに分離される
2. セクションヘッダに件数表示「(N 名)」、件数 0 は「該当なし」
3. 検索・クイックフィルタが両セクション横断で機能
4. エントリー済の行は「現在:Aクラス」or「現在:Bクラス」テキスト表示
5. ボタン色強調(現クラス active / 前回 highlight)が撤廃される
6. F7 編集モーダルの前回クラス radio が A/B 2 択になる
7. F7 保存後、リロードなしで過去参加者パネルに反映される(bug fix #7)
8. 既存 + 新規 e2e すべて緑(visual regression は --update-snapshots で更新)
9. 単体テスト緑(npm test)
10. iPhone 実機目視確認(髙橋さん作業、本仕様書範囲外)
11. Codex Gate Review A 判定(本仕様書範囲外)

---

## §5 リスク・移行戦略

- データ構造変更なし、マイグレーション不要
- F8 import/export 影響なし
- visual regression 更新範囲が大きい → `--update-snapshots` で対応
- 既存 e2e の修正範囲が広い → diff 慎重確認

---

## §6 Devil's Advocate(Codex 必須質問)

A-4.3 と同じ運用ルール「Devil's Advocate 常用化」に従い、Codex Gate Review で以下 5 質問への明示的回答を必須とする:

1. **iOS Safari 固有の罠**: セクションヘッダの件数表示が崩れないか / 「現在:Aクラス」テキストが long 氏名で改行崩れしないか
2. **空セクション UI の扱い**: フィルタ結果で両セクション 0 件のとき UI が崩れないか
3. **F7 保存後の再描画ちらつき**: state 取得のレースで一瞬おかしな表示にならないか
4. **エントリー済 → クラス変更時のセクション内リオーダー**: 直感的か(同セクション内でソート位置が変わるかどうか)
5. **A-4.3 e2e の差分管理**: 削除 / 維持 / 書き換えの判断が一貫しているか

---

## §7 想定外時の対応

- 実機 NG が出た場合(セクション分離による別 regression):main hotfix or revert
- A-4.3 と同様、PR は draft で作成し Codex A 判定 + 実機確認 OK 後にマージ
