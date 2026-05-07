# shogi A-4.3 過去参加者からのクラス変更機能 + マスタ last_class 表示 Codex Gate Review 依頼

**作成日時**: 2026-05-07 19:59 JST
**対象 PR**: feat(a-4-3): 過去参加者からのクラス変更機能 + マスタ last_class 表示
**ブランチ**: `feat/a-4-3-class-change`(main `be270cb` 起点)
**仕様書**: `docs/specs/20260507_1934_shogi_a_4_3_class_change_mini_spec_v1.md`
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge(髙橋さんの実機目視確認 OK 後)

---

## 1. 背景・目的

A-4.2 リグレッション(A-4.2.1 hotfix revert 済、`be270cb`)の真因は **UX 仕様**:

- 過去参加者パネルで既登録者の A/B ボタンが「`duplicate_member` で silent fail」していた
- 「過去参加者から既登録者のクラスを変更する手段がない」「マスタにクラスが表示されていない」

本 PR で 2 課題を一括解決:

1. **3 ケース確認ダイアログ + クラス変更**(過去参加者パネル / サジェスト)
2. **マスタ一覧 + F7 編集モーダルで last_class 表示・編集**

A-T フェーズ(production code 不変原則)を意図的に解除する初の本格的 production 修正。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+193 / -32 行)

| # | 機能 | 場所 | 行 |
|---|---|---|---|
| 1 | `changePlayerClass` 純粋関数 新規 | L979 周辺 | +31 |
| 2 | `handlePastParticipantClassAdd` を 3 ケース分岐に置換 | L1340 周辺 | +60 |
| 3 | `buildPastParticipantsPanelHtml` で現クラス強調(`pp-add-btn-active` + チェック印) | L1255 周辺 | +25 |
| 4 | `handleSuggestClassAdd` を 3 ケース分岐に置換(過去参加者パネルと共通動作) | L2400 周辺 | +40 |
| 5 | `buildMasterTabHtml` のテーブルに「前回クラス」カラム追加 | L1538 / L1560 | +4 |
| 6 | `buildMasterEditModalHtml` に last_class fieldset 追加 + `applyMasterMemberEdit` で更新 | L820 / L1610 | +20 |

### 2.2 設計判断

**(a) `addPlayerFromMaster` は無変更、`changePlayerClass` を新規分離(案 1 採用)**

仕様書 §3.1 で 2 案提示されたが、UI 側で「既登録か」を判定して `addPlayerFromMaster` / `changePlayerClass` を呼び分ける**案 1** を採用。理由:

- `addPlayerFromMaster` L941-942 のコメントで「マスタ側のフィールド(last_class 等)は一切変更しない、saveData → syncBranchMasterOnSave 側の責務」と明示契約。既存 e2e でも検証済み(`addPlayerFromMaster 経由で master.last_class が変更されない`)
- A-4.3 の `changePlayerClass` は「state.players[oldCls] から削除 → newCls に追加 + master.last_class 即更新」と責務が真逆
- 関数を共通化すると「追加 / 変更 / 拒否」混合になり後続変更しにくい
- 案 1 だと `addPlayerFromMaster` は無変更(回帰リスク低)

**(b) サジェストでも 3 ケース分岐(メンタルモデル一貫性)**

仕様書 §2.3 通り「過去参加者パネルと同じ確認ダイアログ」で実装。サジェストは既登録者除外がある(`getCurrentlyRegisteredMemberIds`)ので通常はケース 1 のみだが、レースコンディション保険でケース 2 / 3 も対応。

**(c) `syncBranchMasterOnSave` 整合性**

`changePlayerClass` で master.last_class を即更新しても、saveData 時に `updateBranchMasterFromTournament` (L2119: `member.last_class = p.cls`) が再度同じ値で上書きするだけで矛盾しない。回帰防止のため既存 e2e 「saveData → syncBranchMasterOnSave 後の last_class 更新」も維持。

**(d) 確認ダイアログは `window.confirm` / `window.alert` 使用**

仕様書 §4 通り。新規モーダル UI は作らず、既存実装(マスタ import の `confirm` L1726)と統一。

**(e) 現クラス強調と前回参加クラス強調の併存**

A-4.2 の前回参加クラス強調(黄色 #FFD580 + 「前回:Xクラス」テキスト)はそのまま、A-4.3 の現クラス強調(青/琥珀 + チェック印 + `pp-add-btn-active` クラス)を**追加**。現クラスが立つときは前回クラスハイライトを抑制(現クラス優先)。既存 e2e の `pp-add-btn-highlight` クラス基準テストはそのまま通る。

### 2.3 e2e (`test/e2e/shogi_app_a4_3.spec.js` 新規 +307 行、a4_2.spec.js 修正)

- 新規 42 件: §2.2 確認ダイアログ 3 ケース / §2.1 現クラス強調 / §2.4 マスタ一覧 last_class / §2.5 F7 編集 / §3.1 changePlayerClass 単体
- a4_2 修正: `shogi_assertions.classSelectedFromPast/Suggest` の `beforeClick` で `page.once('dialog', accept)` を仕込み既存テストを最小変更で対応
- a4_2 1 件書き換え: `duplicate_member` テスト → A-4.3 ケース 2 (別クラス変更)成功テストに反転
- a4_2 5 件: 直接 `click()` している箇所(Stage 4 last_class タイミング、Stage 5 長い氏名等)に `page.once('dialog', accept)` を直接追加
- visual_regression snapshot 更新 3 件(マスタ一覧 / 編集モーダル / tombstone、前回クラスカラム追加分)

---

## 3. 受け入れ条件 検証結果(仕様書 §5 1〜6)

| # | 観点 | 検証方法 | 結果 |
|---|---|---|---|
| 1 | 過去参加者パネル A/B ボタン押下時に確認ダイアログ表示 | e2e `§2.2 ケース 1〜3` | ✅ |
| 2 | 3 ケース(未登録 / 別クラス / 同クラス)が正しく動作 | e2e `§2.2` 5 件 | ✅ |
| 3 | クラス変更時に `state.players` + マスタ `last_class` 即更新 | e2e `§2.2 ケース 2 OK`, `§3.1 A→B` | ✅ |
| 4 | マスタ一覧に `last_class` カラム表示 | e2e `§2.4` 4 件 | ✅ |
| 5 | F7 編集モーダルで `last_class` 編集可能 | e2e `§2.5` 4 件 | ✅ |
| 6 | 既存 + 新規 e2e すべて緑 | `npx playwright test` | ✅ **507 passed** |
|   | 単体テスト | `npm test` | ✅ **PASS=50, FAIL=0** |
| 7 | iPhone 実機目視確認 | 髙橋さん | (本レビュー後、merge 前必須) |
| 8 | Codex Gate Review A 判定 | 本レビュー | (本依頼) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `348f381` | docs(a-4-3): 仕様書 v1 配置 |
| 2 | `7106616` | feat(a-4-3): changePlayerClass 純粋関数追加 |
| 3 | `17a4cec` | feat(a-4-3): 過去参加者パネル handler を 3 ケース分岐 + 現クラス強調表示 |
| 4 | `d5a2d0e` | feat(a-4-3): サジェスト handler を 3 ケース分岐に置換 |
| 5 | `1c4c654` | feat(a-4-3): マスタ一覧テーブルに「前回クラス」カラムを追加 |
| 6 | `ed0c848` | feat(a-4-3): F7 編集モーダルで last_class を表示・編集可能に |
| 7 | `83a3d7b` | test(a-4-3): 新規 e2e 追加 + 既存 a4_2 spec の確認ダイアログ対応 |

---

## 5. レビュー観点(必読)

### 5.1 通常観点

1. **§5 受け入れ条件 1〜6 の検証根拠が e2e で十分か**
2. **production diff の最小性**(機能追加分 +193 行は妥当か / 不要な追加はないか)
3. **`syncBranchMasterOnSave` との整合性**(クラス変更の即更新と saveData 時の再上書きの順序が常に整合的か)
4. **既存 e2e 修正の妥当性**(`shogi_assertions.beforeClick` 追加方式は他テストへの副作用がないか / `page.once` 採用の理由は妥当か)
5. **現クラス強調と前回クラス強調の併存ロジック**(`!currentCls` で抑制する設計が直感的か)
6. **`changePlayerClass` のエラーケース漏れ**(`invalid_master` / `invalid_state` / `invalid_id` / `invalid_class` / `not_found` / `same_class` で網羅できているか)

### 5.2 Devil's Advocate 質問(運用ルール「Devil's Advocate 常用化」初適用、必須回答)

A-4.2 リグレッションがレビュー網全すり抜けで実機で死んだ教訓を踏まえ、以下 4 質問への**明示的回答**を必須とする:

1. **iOS Safari 固有の罠は?**
   - `window.confirm` / `window.alert` の挙動差(promise 化、user gesture context loss、blur 競合等)
   - `click` event タイミングと `confirm` blocking の相互作用
   - 連続 tap でダイアログが二重に出ないか
   - F7 編集モーダルの新規 fieldset で blur 競合(既存 `me-name`/`me-yomi` の `.blur()` 呼び出し)に当たらないか

2. **他箇所と event handler 戦略が非対称になっていないか?**
   - 過去参加者パネルは `click`、サジェストは `mousedown` + `touchstart` + `click` 3 段。A-4.3 で確認ダイアログを追加した結果、サジェスト側で `mousedown` と `touchstart` 両方が確認ダイアログを起動しないか
   - サジェスト側 ボタンの `mousedown` と `touchstart` が同 tap で両方発火する構造のため `confirm` が 2 回出る可能性は?

3. **この変更が壊しうる業務シナリオを 5 つ挙げて**
   - 例: 過去参加者を A 登録 → 別クラス変更 → 戻す → saveData の往復で master / state の値が崩れないか
   - F8 import で last_class が含まれない旧マスタを import → F7 編集で last_class radio はどう振る舞うか
   - 削除済み member がレースで現れたとき(deleted フラグの再生成等)
   - state.players に member_id 不在の手入力 player と過去参加者が同名同居している時のクラス変更
   - F2 saveData → クリップボードコピー直前にクラス変更 confirm が出る場合の挙動

4. **`addPlayerFromMaster` / `changePlayerClass` の境界は明確か?**
   - 「未登録 → addPlayerFromMaster」「既登録 → changePlayerClass」の判定が UI 側にしかないので、純粋関数だけ呼ぶ将来コードが境界を踏み外すリスクはないか
   - duplicate_member error が UI 経路では絶対起きない(必ず先にケース 3 で弾かれる)前提だが、その前提が崩れた時のフォールバック挙動は妥当か

---

## 6. 想定される A 判定外要素(自己点検)

- **DOM 文字列構築の長さ**: `buildPastParticipantsPanelHtml` のボタン style 文字列が長くなった(三項演算子 3 段ネスト)。可読性は悪いが既存の同関数のスタイルと整合的。
- **`changePlayerClass` 内の linear search**: 小規模(数十名)前提の沼津支部運用では問題なし。性能要件はない。
- **`window.confirm` の改行表示**: ケース 2 のダイアログ文言に `\n` を含む。iOS Safari で改行扱いが OS / ブラウザ依存だが、文意は伝わる(改行されなくとも読める)。

---

**END**
