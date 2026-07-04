# MASTER-EDIT-UX-001 — 支部マスタ 氏名/ふりがな編集のスマホ改善 設計

| 項目 | 内容 |
|---|---|
| ID | MASTER-EDIT-UX-001 |
| 種別 | 設計（docs-only / 実装前） |
| 作成日 | 2026-07-04（実機 iPhone 検証で発見） |
| ステータス | Draft（レビュー前・実装は後続 MASTER-EDIT-UX-IMPL） |
| base | orphan clean base `chore/shogi-tour-apphq-003h-2d-orphan-clean-base` |
| 対象ファイル（実装は別PR） | `shogi_v4.html` のみ |
| 準拠 | STYLE-GUIDE §1 色 / §2 ボタン(44px) / §4 文言 / §6 レイアウト・CLAUDE.md 拘束9ルール・REFERENCE §3 |
| 関連 | 参考モック（チャット提示・`master_furigana_edit_before_after`） |

---

## 0. 要約（TL;DR）

支部マスタの「名簿のメンテナンス」で氏名/ふりがなを編集すると、スマホで窮屈で使いにくい。原因は、氏名セルをタップした際に `masterSheetStartNameEdit` が **狭い `.master-cell-name` セルの中に**「ふりがな入力」「氏名入力」を `width:96%` で押し込むこと。マスタ表（`.master-sheet-row`）は 会員/級/最終参加 など複数列で、スマホ幅では横に溢れる。結果:

- (a) 編集枠が列幅に縛られて**小さい**、
- (b) 右側の列（会員/級/最終参加）が**切れて見えない**、
- (c) **横スクロールが編集と干渉**してうまく操作できない。

本設計は編集を**狭いセルから出す**。氏名セルをタップしたら、その行の直下に**全幅の編集パネル**（ふりがな・氏名を大きいラベル付きフィールドで縦に、会員/級のトグルも、保存/キャンセル）を開く。表の横スクロールと無関係になり、枠が広く右列も隠れない。データ層（`applyMasterMemberEdit`）と会員/級の切替（既存 `.master-cell-member`/`.master-cell-grade` の tap 切替ロジック）は**再利用**し、編集の入口だけを差し替える。

本書は **docs-only**。実装は後続 **MASTER-EDIT-UX-IMPL**（Draft PR で停止）。UI は提示済みモックに準拠。

---

## 1. 背景・問題（現状の実測）

- マスタ表の描画は `.master-sheet-row`（`shogi_v4.html`）。列は チェックボックス / 氏名(ふりがなルビ付き) / 会員 / 級 / 最終参加（/ 削除日）。氏名セル＝`.master-cell-name`（`title="タップで氏名・ふりがなを編集"`）。
- 氏名セルタップ → `masterSheetStartNameEdit(mid)`：`cell.innerHTML` を **2つの `<input>`（`#ms-edit-yomi` / `#ms-edit-name`、いずれも `width:96%`）** に差し替え。IME 変換ガード・`focusout` 自動確定・Enter/Esc 対応あり（`masterSheetCommitNameEdit`/`masterSheetCancelNameEdit`）。
- 会員/級は別セル（`.master-cell-member`/`.master-cell-grade`）の**タップ切替**。
- 問題: 編集 input が氏名セル幅に縛られる＋表が横溢れ（会員/級/最終参加が右で切れる）＋横スクロールと編集操作が干渉。PC では余裕があり目立たないが、スマホで顕在化。

> 既存の `master-edit-modal`（id）は旧 F7 編集モーダル系（`docs`／コメント上 deprecated 扱い）。本設計では**再利用可否を実装時に確認**し、使えるなら編集の正規ルートとして復活、使いにくければ「行直下の全幅パネル」を新設する（どちらも下記 UX を満たす）。

---

## 2. スコープ

### 2.1 やること

1. 氏名セルタップの編集入口を、**狭いセル内 innerHTML 差し替え**から**全幅の編集パネル**へ変更。
2. パネルは **ふりがな / 氏名**（大きいラベル付きフィールド・縦積み）＋ **会員/級のトグル**＋ **保存 / キャンセル**。
3. 保存はデータ層 `applyMasterMemberEdit(memberId,newName,newYomi,master,options)` を**そのまま利用**（会員/級は options 経由）。同名重複検知の既存挙動も維持。
4. IME 変換ガード・空氏名バリデーション・保存検証（既存 `masterSheetCommitNameEdit` の不変条件）を踏襲。

### 2.2 やらないこと

- 表そのものの列再設計（会員/級のアイコン化など）は別スライス（本スライスは編集入口の差し替えに集中）。
- マスタのスキーマ変更・参加履歴/削除フラグへの変更（`applyMasterMemberEdit` の非改変領域）。
- 当日運営（参加者登録タブ）フローの変更。

---

## 3. UX 設計（モック準拠・STYLE-GUIDE 準拠）

```
[ □ 山田太郎  やまだたろう      会員・三段 ]   ← 通常行
[ □ 佐藤一郎  さとういちろう          ▲ ]   ← タップした行（選択状態）
┌ 編集（全幅パネル・行直下に展開） ─────────┐
│ ふりがな [ さとういちろう            ] │  ← 大きいフィールド・ラベル付き
│ 氏名     [ 佐藤一郎                  ] │
│ 区分 [会員|一般]     級・段 [初段 ▼]     │  ← 既存 tap 切替のトグル/選択
│           [ キャンセル ]  [ 保存 ]      │  ← 44px・保存は primary
└──────────────────────────────────────────┘
[ □ 鈴木五郎  すずきごろう        会員・2級 ]
```

- **全幅**（表の横スクロールに依存しない）。行の直下に展開（`<tr>` を1本挿入 or 行直後の全幅 details/panel）。
- フィールドは `font-size:16px`（iOS 拡大防止）・タップ目標 44px（STYLE-GUIDE §2.2）。
- ラベルは「ふりがな」「氏名」「区分」「級・段」。保存は `.btn-primary`、キャンセルは通常ボタン（§2.1）。色は既存意味色のみ（新色なし・§1）。
- **結果が見える位置**：保存/キャンセルはパネル内に常設（スクロール不要で押せる＝ui-result-visibility 原則）。
- 編集中は他行の編集を開始しない（既存 `_masterEditingMid` の再入防止を踏襲）。

---

## 4. データ・関数の再利用

| 必要な処理 | 既存関数（再利用） |
|---|---|
| 保存（name/yomi/会員/級） | `applyMasterMemberEdit(memberId,newName,newYomi,master,options)`（options.member/grade） |
| 会員/級の値 | 既存 `.master-cell-member`/`.master-cell-grade` の tap 切替が持つ enum（member: member/other、grade: ippan/chu/josei） |
| よみ正規化 | `normalizeYomi` / 氏名 `normalizePersonName` |
| 保存後の再描画 | 既存マスタ表 render（`renderMasterSheet` 相当）/ `saveBranchMaster` |
| IME/確定/検証 | `masterSheetCommitNameEdit`/`masterSheetCancelNameEdit` のガードを踏襲（composition・空氏名 alert・保存検証） |

> 保存ロジック・スキーマは新設しない（`applyMasterMemberEdit` が単一窓口・REFERENCE §3）。

---

## 5. 実装スライス境界（build / bind / coordinator）

| 追加/変更 | 種別 | 内容 |
|---|---|---|
| `buildMasterEditPanelHtml(member)` | 追加（build・pure） | 全幅編集パネルの HTML（ふりがな/氏名/区分/級・段/保存・キャンセル）。氏名/よみは escape 経由 |
| `openMasterEditPanel(mid)` | 変更（旧 `masterSheetStartNameEdit` の役割を置換 or ラップ） | セル innerHTML 差し替えをやめ、行直下に全幅パネルを開く。`_masterEditingMid` 再入防止踏襲 |
| `bindMasterEditPanelEvents(mid)` | 追加（bind） | 保存/キャンセル/トグルの結線・IME ガード・focusout 自動確定（既存踏襲） |
| `commitMasterEditPanel(mid)` | 変更（`masterSheetCommitNameEdit` を流用/改名） | パネルの値で `applyMasterMemberEdit` を呼び保存・再描画 |
| CSS `.master-edit-panel` ほか | 追加（新規 class のみ） | 全幅・44px・primary。既存 `.master-*` セレクタや表 CSS の挙動は変えない（拘束ルール3） |

- **build/bind/coordinator 分離維持**（拘束ルール2）。**ES5・グローバル state 維持**（拘束ルール4）。
- **挙動変更（編集入口の差し替え）はリファクタと別フェーズ**（拘束ルール7）。
- 既存の会員/級 tap 切替は残す（パネル内トグルは同 enum を共有）。

---

## 6. 受入条件

1. 氏名セルをタップすると、**行直下に全幅の編集パネル**が開き、ふりがな・氏名が大きいフィールドで表示される（狭いセル内編集をしない）。
2. パネルで会員/級も切替でき、**保存で `applyMasterMemberEdit` 経由**で name/yomi/member/grade が更新される（同名重複検知の既存挙動維持）。
3. 空氏名は保存不可（既存 alert 文言）。IME 変換確定の Enter で誤保存しない（composition ガード踏襲）。
4. パネル表示中に他行タップで編集が二重に開かない（`_masterEditingMid` 再入防止）。
5. 保存/キャンセルは**スクロールせず押せる位置**にあり、右列が隠れない・横スクロール干渉がない。
6. 会員/級のセル tap 切替（既存）は従来どおり動く。表の横スクロール自体は不変。
7. `bash test/run_tests.sh shogi_v4.html` が **WARN=0**・本変更で FAIL 増加なし。マスタ編集系テスト（`applyMasterMemberEdit` の A3-S2-edit-*、master-sheet 系）を破らない／必要なら特性化 golden を更新。
8. 氏名/よみ/会員バッジは escape 経由（XSS 安全）。

## 7. リスクと軽減

| リスク | 軽減 |
|---|---|
| 既存インライン編集の特性化テスト破壊 | 保存の単一窓口 `applyMasterMemberEdit` は不変。入口 UI の差し替えに限定し、該当テストは意図的更新（UPDATE_GOLDEN 等）・別コミット |
| IME/focusout の取りこぼし | 既存 `masterSheetCommitNameEdit` のガードを流用（composition/keyCode229/focusout setTimeout） |
| CSS 挙動変化（拘束ルール3） | 新規 class のみ。既存 `.master-*`・`section` 閉じタグ省略に触れない |
| 表の横あふれ自体 | 本スライス対象外（編集入口のみ）。列再設計は別スライスに切り出し |

## 8. 工程・ロールアウト

- 本書 = 設計（docs-only / L1–L2）。GitHub へ定型ヘッダ＋凍結マーカー（`verdict:`）を書き戻して1工程完了。
- レビュー: 別セッション・別素性。UI（STYLE-GUIDE §1/§2/§4/§6）と既存編集ガードの踏襲を観点に。
- 実装（MASTER-EDIT-UX-IMPL）: **追加/最小改変中心**・Draft PR で停止（Ready化/merge/production は人間の明示承認まで未実施）。挙動変更（入口差し替え）と CSS（見た目）は別コミット。
- production 反映時: `index.html` + `shogi_v4.html` を公開し **`?v=N` インクリメント**（拘束ルール9）。

---

正本ポインタ: データ層 = `applyMasterMemberEdit`（`shogi_v4.html`）／現状の編集 = `masterSheetStartNameEdit`/`masterSheetCommitNameEdit`／UI 規約 = `docs/STYLE-GUIDE.md`／データモデル不変条件 = `docs/REFERENCE.md` §3。
