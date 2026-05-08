# Phase 1 city field Codex Gate Review 依頼

**作成日時**: 2026-05-08 09:40 JST
**対象 PR**: feat(phase1): add city field to person master
**ブランチ**: `feat/phase1-city-field`(main `1c41594` 起点 = Phase 2 仕様 finalize 後)
**仕様書**: `docs/specs/20260508_0857_phase1_city_field_spec.md`(A- レビュー反映済)
**Plan**: `docs/specs/20260508_0924_phase1_plan.md`(髙橋さん承認済)
**レビュー深度**: Gate Review(Codex のみ、ChatGPT スキップ)、1 PR 1 回
**判定基準**: A 以上で squash merge(髙橋さんの実機目視確認 OK 後)

---

## 1. 背景・目的

5/10 月例将棋大会本番に向け、過去 1 回分(2026-04-12)の参加者 22 名を Phase 2 でマスタへ取り込む。取り込み時に **市町村** 情報も同時保持したいため、先にスキーマへ `city` フィールドを追加する。マスタ一覧画面の 5 列構成(roadmap v21 確定)は維持し、city は F7 編集モーダル内のみで扱う。

---

## 2. 変更内容

### 2.1 production 修正 (`shogi_v4.html`、+30 / -2 行、コミット `ab19ec5`)

Plan §2.1 表 A〜F を実装:

| # | 関数 / 箇所 | 変更内容 |
|---|---|---|
| A | `normalizeBranchMaster` member 構築 | `city: normalizeCity(m.city)` 追加 |
| B | `normalizeCity` 新設 helper | `String(value??'').trim().slice(0,20)` 相当(value 非文字列は ''、null/undefined→'') |
| C | `createMemberFromParticipant` | 戻り値に `city: ''` default |
| D | `applyMasterMemberEdit` | `hasCityOpt` チェック + `target.city = normalizeCity(options.city)` |
| E | `buildMasterEditModalHtml` | ふりがな input 直後に「市町村」input(maxlength=20、placeholder="例:沼津市") |
| F | `bindMasterEditModalEvents` | `me-city` 値取得 + `cityInput` 存在時のみ `options.city` 渡す + blur() 含む |

### 2.2 設計判断(Plan §1.4 + §2.4)

**(a) `BRANCH_MASTER_SCHEMA_VERSION` は 1 のまま維持(bump 厳禁、P0)**

`normalizeBranchMaster` L457-459 が schema_version 不一致時に `createEmptyBranchMaster()` を返す **データ破壊設計**(migration 関数なし)。bump = 既存ユーザの localStorage(v=1)が読込時に**空マスタへ置換 = マスタ全消失 P0**。
仕様書 §8.1「migration 関数なし → 補完のみ」相当の判断、§6 Out of Scope「schema_version 新設は §8.1 で『無し』判定時は含めない」とも整合。

**(b) `applyMergeImport` の city merge ポリシー: 既存維持(L731 既存方針)**

仕様書 §2.1 では正規化ルールのみ規定、merge 時の上書き/維持は未規定。実装側判断として、L731 既存コメント「name/yomi/member/grade/last_class/note は既存維持」と同方針で **id 一致時の city も既存維持**。**Codex review で要確認**。

**(c) F7 city 入力欄の配置: ふりがな直後**

「個人属性(氏名 / ふりがな / 市町村)→ 区分 fieldset 群 → 履歴情報」の論理順序を維持。

**(d) `cityInput` 不在時のフォールバック**

仮に F7 モーダル DOM が将来変わって `me-city` input が消えても、`bindMasterEditModalEvents` で `if(cityInput)options.city=newCity` ガードしているため `applyMasterMemberEdit` は city 未指定扱い → 既存 city 値維持(下位互換)。

### 2.3 e2e (`shogi_phase1_city.spec.js` 新規 +290 行、F7 visual snapshot 2 枚更新)

新規 16 件(2 project で計 32 件、全緑):
- §5 #1 F7 city 保持: 3 件(入力 → 保存 → 再オープン保持 / 空入力保持 / maxlength=20 + placeholder)
- §5 #2 正規化ルール: 5 件(trim / null→'' / undefined → no-op / normalizeCity 単体 / normalizeBranchMaster の 30 文字切り詰め)
- §5 #3 旧データ下位互換: 2 件(city 不在 → loadBranchMaster で '' 補完 / F7 編集 → 保存可能)
- §5 #4 backup/restore round-trip: 4 件(export 含有 / overwrite import 保持 / 旧 JSON 補完 / merge 既存維持)
- §5 #5 マスタ一覧不変 + L-3: 2 件(thead 5 列維持 / iPhone 375px overflow なし)

visual snapshot 更新 2 枚(F7 編集モーダル):
- `master-edit-modal-375-chromium-desktop`
- `mobile-master-edit-modal-375-mobile-375`

city input 追加分の差分は `maxDiffPixelRatio:0.05` 閾値内で pass するが、Plan §2.2 通り明示削除→再生成で反映の透明性を確保(A-4.6 と同方針)。

### 2.4 結果

- 全 e2e: **626 passed**(従来 594 + phase1 32)
- 単体テスト: **PASS=50, FAIL=0**

---

## 3. 受け入れ条件 検証結果(仕様書 §5 1〜6)

| # | 観点 | 結果 |
|---|---|---|
| 1 | F7 city 入力 → 保存 → 再オープンで保持 | ✅ PASS(`Phase 1 §5 #1` 3 件) |
| 2 | 正規化ルールが手入力 / import / 旧データ補完すべてで一貫 | ✅ PASS(`Phase 1 §5 #2` 5 件、normalizeCity 単体 + applyMasterMemberEdit + normalizeBranchMaster) |
| 3 | city 不在の旧データ → "" で表示・編集可能 | ✅ PASS(`Phase 1 §5 #3` 2 件) |
| 4 | backup → restore round-trip で city 保持 | ✅ PASS(`Phase 1 §5 #4` 4 件、overwrite + merge + 旧 JSON 補完) |
| 5 | マスタ一覧 5 列構成・既存挙動変化なし | ✅ PASS(thead 5 列確認 + 既存 a4 / a4_3 / a4_5 / a4_6 / shogi_master_list spec 全緑) |
| 6 | 既存 e2e 594 緑維持 | ✅ PASS(**626 passed** = 594 + 32) |

---

## 4. コミット履歴

| # | SHA | 概要 |
|---|---|---|
| 1 | `5c5a7aa` | docs(phase1): Plan Mode output for city field |
| 2 | `ab19ec5` | feat(phase1): add city field to person master |
| 3 | `7c7599b` | test(phase1): city field e2e + visual snapshot 更新 |

---

## 5. レビュー観点(必読)

### 5.1 Codex Gate Review 観点(P0 + 保存読込 + データ破壊 + 既存挙動破壊)

1. **localStorage マイグレーション安全性(P0)**
   - `BRANCH_MASTER_SCHEMA_VERSION` を 1 のまま維持 → 既存 v=1 ユーザは読込時に L457-459 を通過 → city='' 補完される
   - bump 案を採用しなかった理由(L459 の破壊的分岐)が妥当か
   - **既存マスタ消失リスクなし**

2. **backup JSON 下位互換**
   - city 付き JSON を旧版(現 main = `1c41594`)で読み込んだ場合、`normalizeBranchMaster` L491-505 の明示フィールド列挙で city が **dropped されるのみ** → 他フィールド破壊なし
   - city 不在の旧 JSON を新版で読み込んだ場合、normalizeBranchMaster で city='' 補完(e2e §5 #3 / §5 #4 で確認)

3. **F7 レイアウト L-1〜L-4 違反なし**
   - city input 1 行追加(モーダル全体高さ +50px 程度)
   - L-3 `expectNoHorizontalOverflow` で iPhone 375px の F7 モーダルが viewport 内であることを assert(`Phase 1 §5 #5` test)
   - mobile-375 visual snapshot で視覚的にも確認

4. **e2e 594 緑維持**
   - 全 e2e 626 passed = 594(従来)+ 32(新規 phase1)
   - 既存 master 系 spec(a4 / a4_3 / a4_5 / a4_6 / shogi_master_list)は city 関係なく緑維持

5. **§2.1 正規化ルール一貫適用(手入力 / import / 旧データ補完すべて)**
   - **手入力**: F7 → `bindMasterEditModalEvents` → `applyMasterMemberEdit` → `normalizeCity`
   - **JSON import**: `applyOverwriteImport` / `applyMergeImport` → `normalizeBranchMaster` → 各 member 構築時に `normalizeCity(m.city)`
   - **旧データ補完**: `loadBranchMaster` → `normalizeBranchMaster` → 同上
   - **`normalizeCity` 単一関数に集約**することで、3 経路すべてで同じ trim + maxlength 20 + null/undefined→'' を保証

### 5.2 Devil's Advocate(自己点検)

1. **`normalizeCity` の type guard**: `String(value ?? "").trim()` ではなく `if(typeof value!=='string')return ''` 採用。仕様書 §2.1 「`String(value ?? "").trim()`」と微妙に違うが、結果は等価(数値 / オブジェクト等は '' として扱う)。明示的な型チェックの方が読みやすい判断。Codex に妥当性確認依頼。

2. **`applyMergeImport` の city ポリシー(自己判断)**: 仕様書未規定、実装側で「id 一致なら既存維持」を採用。merge ポリシーが name/yomi/member/grade と一貫することを優先。**Codex review で確認依頼(誤判断あれば指摘ください)**。

3. **F7 input 1 行追加の影響**: モーダル全体高さが ~50px 増えるため、低身高さ画面(iPhone SE 等 568px)でモーダル下端の保存ボタンが見切れる可能性。ただし `max-height: 85vh; overflow-y: auto`(L1728)で auto scroll 可、現状 visual snapshot で確認可能。

4. **`cityInput` 存在チェック**: `if(cityInput)options.city = newCity` だが、未来の DOM 改変で me-city が無くなった場合、city は **「変更しない」(既存値維持)**。これは仕様書 §2.1 の「保存前正規化」の暗黙前提を満たすか?(明示更新の経路がなくなるリスク)→ 現状は問題なし、将来 DOM 改変時に再検討。

---

## 6. 想定される A 判定外要素(自己点検)

- **`normalizeCity` の文字列切り詰め基準**: `slice(0, 20)` は **コードポイント単位ではなく UTF-16 code unit 単位**。サロゲートペア(絵文字等)を含む場合、20 ではなく 21 unit に丸まることはあり得る。市町村名にサロゲートペアが入る業務シナリオはほぼ無いため許容、ただし仕様書 §2.1 の「maxlength=20」が文字単位と code unit 単位どちらを意図しているか **Codex に確認**。
- **F7 visual snapshot の更新方針**: maxDiffPixelRatio 閾値内で自動 pass する小さな変更を「明示削除→再生成」する判断は A-4.6 と同方針。視覚反映の透明性 vs PR diff サイズのトレードオフ、Codex 意見受領可。

---

**END**
