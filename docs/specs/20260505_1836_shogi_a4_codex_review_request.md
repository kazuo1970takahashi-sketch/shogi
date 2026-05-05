# A-4 Codex 独立レビュー依頼

**対象 PR**: https://github.com/kazuo1970takahashi-sketch/shogi/pull/8
**ベース**: main ← feat/phase-a4-master-mgmt
**設計仕様書**: `docs/specs/20260505_1746_shogi_design_phaseA4_v2.md`（v2 / ChatGPT A判定）
**実装依頼書**: `docs/specs/20260505_1752_shogi_a4_claude_code_task.md`
**実装サマリ**: PR #8 のサマリー欄、または下記参照

---

## 1. 実装サマリ

### Stages
| Stage | 内容 | commit |
|-------|------|--------|
| 1 | 登録画面ふりがな入力欄（UI + 手動入力 + サジェスト連携） | c7d24a2 |
| 2 | IME 自動取得ロジック（CompositionEvent + 累積 + 手動編集保護） | 3b44746 |
| 3 | マスタ一覧 + 編集モーダル member/grade（履歴情報読取専用） | 780a2c9 |
| 4 | 削除済み member 復元 UI（純粋関数 + トグル + 復元後再反映） | 293da4b |
| 5 | ふりがな未入力可視化（サマリー / バッジ / QUICK_FILTER_NO_YOMI） | 6d56609 |
| 6 | レイアウト揺れ調査 + 1px許容 e2e（**揺れ修正は A-4.1 へ**） | 10a122c |

### テスト結果
- 単体: **604件**全 PASS / FAIL 0（ベースライン 547 + A-4 追加 57）
- e2e: **182件**全 PASS / FAIL 0（ベースライン 80 + A-4 追加 102）

### Stage 6 の判定
Chromium で 375 / 414 / 430px 全条件 offenders 0件、iPhone Safari 固有現象。§3.6.3 禁止事項（`overflow-x:hidden だけで隠さない` / `推測で全体CSSを書き換えない`）に従い、A-4 本体には**調査ログ + 1px許容 e2e のみ**。揺れ修正本体は A-4.1 として別PR化。

---

## 2. レビュー観点

### 2.1 設計仕様書 v2 §7 実装禁止事項 17項目の遵守確認

最重要（再掲）：
1. ✅ schema_version 変更なし（branch master=1, state=4）
2. ✅ 新規スキーマフィールド追加なし
3. ✅ ふりがな自動推定（kuromoji.js等）実装なし
4. ✅ **player.yomi フィールド追加なし**（一時的にも追加しない）
5. ✅ 既存 A-3 機能破壊なし（既存テスト547+80件全件緑）
6. ✅ **applyMasterMemberEdit シグネチャ厳守**：`(memberId, newName, newYomi, master, options)` のみ採用、第4引数 master 位置不変、新関数なし
7. ✅ A-4 でリリースしない機能の先取りなし
8〜17: IME外部ライブラリなし、登録ブロックなし、物理削除なし、member_id 不変、CSS 推測修正なし、A-3 連携保護、等

**Codex 確認依頼**：実装を見て、これらが本当に守られているか独立検証してほしい。

### 2.2 ChatGPT v2 メタレビュー Should Fix 3件の実装

| # | 内容 | 実装場所 |
|---|------|---------|
| 1 | `_pendingNewYomi` のキー衝突回避 → **player.id キー**で保持 | `addPlayer` / `updateBranchMasterFromTournament(yomiMap)` |
| 2 | サジェスト由来 yomi の更新条件を安全側に → **既存マスタ yomi が空のときのみ補完** | `addPlayer` 内 `suggestSelected` 分岐 |
| 3 | CompositionEvent の e2e 代替 → **synthetic dispatch + 実機確認を完了条件に残す** | `test/e2e/shogi_app_a4.spec.js` `imeCompose()` |

**Codex 確認依頼**：これらの実装が安全側に倒れているか、エッジケース（同名異人、yomi 既存値、CompositionEvent 非対応ブラウザ）で問題が出ないか。

### 2.3 IME 自動取得ロジック §3.1.2 の正確な実装

状態管理 3 変数（`_yomiAutoBuffer` / `_yomiManuallyEdited` / `_suggestState.selectedMemberId`）の遷移：
- compositionstart で buffer リセット
- compositionupdate でひらがなのみ buffer 更新（漢字変換中の data はスキップ）
- compositionend で `_yomiManuallyEdited === false` の場合のみ buffer を yomi 欄末尾に追記
- 苗字・名前の連続変換で累積される
- ふりがな欄を直接編集 → `_yomiManuallyEdited=true`、以降の自動追記停止
- サジェスト選択は手動編集扱いにしない
- addPlayer 成功 / 氏名欄クリアでフラグリセット

**Codex 確認依頼**：上記 7 ルールが実装で正しく担保されているか、特に「IME 確定前に追加ボタンを押した場合の compositionend 順序」「手動編集後のサジェスト選択」「氏名欄を編集 → ふりがな欄を編集 → IME → 確定」など複合ケースでの挙動。

### 2.4 applyMasterMemberEdit options 拡張の atomic 性

仕様書 §3.3.2：`options.member` / `options.grade` の不正値時は **target を一切触らない**（atomic validation）。

**Codex 確認依頼**：実装で `target.name = nm` / `target.yomi = yo` が options バリデーション**前**に実行されていないか。失敗時にマスタが部分更新される脆弱性がないか。

### 2.5 Stage 4 復元 UI の安全性

- `applyMasterMemberRestore` の戻り値とエラー種別（`invalid_master` / `invalid_id` / `not_found` / `not_deleted`）
- 復元後に member_id が変わっていない（22件の単体テストで検証済みだが Codex でも独立確認）
- 復元後の再反映：通常マスタ一覧 / 過去参加者パネル / サジェスト候補 / ふりがな未入力フィルタ
- confirm cancel で復元されない

### 2.6 Stage 6 のスコープ判断

- 揺れ修正を A-4.1 へ切り出した判断は妥当か
- 1px 許容 e2e（Should Fix 5）が回帰防止として十分か
- 調査ログ `docs/reviews/20260505_1810_a4_stage6_layout_probe.md` の妥当性

### 2.7 e2e テストカバレッジ

102件の e2e（Stage 1: 14件 / Stage 2: 16件 / Stage 3: 14件 / Stage 4: 14件 / Stage 5: 12件 / Stage 6: 24件 + 共通 8件）で以下がカバーされているか：
- 異常系（不正値・空文字・未存在 ID）
- 境界条件（同名異人・全角空白・yomi カタカナ）
- 既存機能の回帰（A3-S2-edit-01〜29 / A3-S3-del-01〜26 / A3-S7-qf-01〜27）

### 2.8 セキュリティ・パフォーマンス

- `_pendingNewYomi` のメモリリーク（addPlayer / removePlayer / saveData / resetAll でクリア漏れがないか）
- IME イベントの過剰発火による負荷
- DOM 操作の O(N) → O(N²) 退化がないか（マスタ件数増加時）

---

## 3. レビュー判定基準

| 判定 | 内容 |
|------|------|
| **A / Go** | Must Fix なし、マージ可 |
| **A- / Conditional Go** | 軽微な Should Fix のみ、マージ後対応可 |
| **B / Conditional Go** | Must Fix 1〜2件、要修正後再レビュー |
| **C / No Go** | 重大な仕様逸脱・既存機能破壊あり |

Must Fix がある場合は具体的な修正方針も提示してください。

---

## 4. 補足情報

- **A-3 既存テスト**: A3-S2-edit（編集29件）、A3-S3-del（削除26件）、A3-S7-qf（クイックフィルタ27件）すべて緑維持
- **iPhone Safari 実機確認**: A-4 完了条件として残置（手元実機なし）
- **A-4.1 予定**: iPhone 16 Plus 実機計測 → 修正候補（min-height: -webkit-fill-available 等）から最小修正選定 → 別ブランチ feat/phase-a4-1-layout-shake
