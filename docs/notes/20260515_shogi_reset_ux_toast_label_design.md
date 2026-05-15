# RESET-UX-TOAST-LABEL-DESIGN — 全リセット完了toast文言の方針

**Task ID**: `RESET-UX-TOAST-LABEL-DESIGN`
**作業種別**: docs-only / design / reset UX / full reset toast label clarification
**HEAD**: `8fea0ee`（PR #118 squash merge 後の main）
**前提 PR 系列**:
- **PR #112** `RECEPTION-UX-START-BUTTON-GUARD-IMPL-LIGHT`（[shogi_v4.html:4429](../../shogi_v4.html) `startTournament` 冒頭の `state.started===true` ガード）
- **PR #113 / #114** `RESET-UX-PARTIAL-RESET-DESIGN` / `IMPL-LIGHT`（[shogi_v4.html:5924](../../shogi_v4.html) `resetTournamentProgressOnly` + [shogi_v4.html:101](../../shogi_v4.html) `#resetProgressBtn`）
- **PR #115 / #116** `REMOVE-PLAYER-GUARD-MESSAGE-DESIGN` / `IMPL-LIGHT`（[shogi_v4.html:3761](../../shogi_v4.html) `removePlayer` の 2 つの削除不可 alert を「大会進行データをリセット」誘導へ）
- **PR #117** `RESET-UX-FULL-RESET-LABEL-DESIGN`（[`docs/notes/20260515_shogi_reset_ux_full_reset_label_design.md`](20260515_shogi_reset_ux_full_reset_label_design.md)）
- **PR #118** `RESET-UX-FULL-RESET-LABEL-IMPL-LIGHT`（[shogi_v4.html:100](../../shogi_v4.html) `#resetBtn` 文言「大会データを全リセット」+ [shogi_v4.html:5946](../../shogi_v4.html) `resetAll` confirm 文言更新）

---

## 1. 目的と非目的

### 1.1 目的

- **PR #118 で意図的にスコープ外として温存した完了 toast 文言**（[shogi_v4.html:5974](../../shogi_v4.html) `resetAll()` の `showMsg('リセットしました','ok')`）について、後続でボタン・confirm 側に揃えるべきか / 現状維持で良いかを docs-only で整理する
- PR #117 §10.3 / PR #118 HANDOFF entry で「次タスク候補」として明示された `RESET-UX-TOAST-LABEL-DESIGN` の論点を閉じる
- 後続 IMPL-LIGHT で実装する場合の **スコープ / テスト方針 / VRT・E2E 影響 / リスク** を整理し、推奨案を確定する

### 1.2 非目的

- 今回は **実装しない**（docs-only design check）
- `shogi_v4.html` / `test/` / `test/e2e/` / Visual Regression snapshot / `.github/workflows/` / `package*.json` / `playwright.config.js` / `docs/specs/` / `index.html` / `data/` を変更しない
- [`resetAll()`](../../shogi_v4.html) [L5945](../../shogi_v4.html) の **初期化ロジック / confirm 文言 / ボタン文言は変更しない**（PR #117 / #118 確定スコープを維持）
- [`resetTournamentProgressOnly()`](../../shogi_v4.html) [L5924](../../shogi_v4.html) の仕様 / confirm 文言 / 完了 toast 文言「大会進行データをリセットしました」は変更しない
- [shogi_v4.html:2380](../../shogi_v4.html) `マスタをリセットしました(全 member 消去)` の toast 文言は変更しない（別機能 = `MasterResetModal` 系、本タスクの対象外）
- [`removePlayer()`](../../shogi_v4.html) [L3761](../../shogi_v4.html) の削除不可 alert 文言（PR #116 確定文）は変更しない
- [`startTournament()`](../../shogi_v4.html) [L4429](../../shogi_v4.html) の guard alert 文言（PR #112 / PR #114 同期更新確定文）は変更しない
- `#resetBtn` / `#resetProgressBtn` の DOM・配置・色（`btn-danger`）・CSS / layout 変更
- 自動バックアップ / undo / 専用モーダル / confirm 連鎖 / toast の出現時間・色・aria-live 強化
- VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更

---

## 2. 背景

### 2.1 直近の合意ライン

- **PR #117 / #118**: `#resetBtn` 表示文言を `大会データをリセット` → `大会データを全リセット` に、`resetAll()` の confirm を `参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。` に更新（[shogi_v4.html:100](../../shogi_v4.html) / [shogi_v4.html:5946](../../shogi_v4.html)）
- 同 PR の design doc §6.2 / IMPL HANDOFF entry **不変項目** に「完了 toast 文言」を明記、スコープ外として `showMsg('リセットしました','ok')` を温存
- Codex Should Fix 対応で VRT snapshot は darwin variant 3 PNG（pp-panel-3sections / master-edit-modal / master-list-5cols）を更新済 — header baseline catch-up を含む
- ChatGPT 司令塔および Codex review 整理でも「toast 文言は IMPL-LIGHT に含めず、後続の小規模 design で扱う」方針で整合済み

### 2.2 現状仕様（コード直視）

| 観点 | `resetTournamentProgressOnly()`（部分） | `resetAll()`（全） |
|---|---|---|
| トリガーボタン | [`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html)「大会進行データをリセット」 | [`#resetBtn`](../../shogi_v4.html) [L100](../../shogi_v4.html)「大会データを全リセット」 |
| confirm 文言 | 「参加者一覧は残したまま、現在の組み合わせ・勝敗結果を削除します。\nよろしいですか？」（[L5925](../../shogi_v4.html)） | 「参加者一覧・組み合わせ・勝敗結果を含む大会データをすべてリセットします。\n支部マスタは保持されます。」（[L5946](../../shogi_v4.html)） |
| 完了 toast 関数 | [`showMsg`](../../shogi_v4.html) [L3096](../../shogi_v4.html)（`#reg-msg` の `.alert.alert-ok` に挿入） | 同左 |
| 完了 toast 文言 | 「大会進行データをリセットしました」（[L5942](../../shogi_v4.html)） | **「リセットしました」**（[L5974](../../shogi_v4.html)） |
| 完了 toast type | `'ok'` | `'ok'` |
| 表示要素 | `#reg-msg` ([L130 近辺の static HTML](../../shogi_v4.html))、`escapeHtml(text)` 経由、`alert` クラス（CSS で色帯） | 同左 |
| toast 消去 | 同タブ内で次の `showMsg(...)` 呼出によって上書き（タイマー自動 clear なし） | 同左 |

### 2.3 周辺 toast 文言（コード直視）

- [shogi_v4.html:2380](../../shogi_v4.html): `showMsg('マスタをリセットしました(全 member 消去)','ok')` — マスタ全消去モーダル経由（本タスクの対象外、別機能）
- [shogi_v4.html:5942](../../shogi_v4.html): `showMsg('大会進行データをリセットしました','ok')` — `resetTournamentProgressOnly()` 完了時（**本タスクで揃える基準点**）
- [shogi_v4.html:5974](../../shogi_v4.html): `showMsg('リセットしました','ok')` — `resetAll()` 完了時（**本タスクの変更候補**）

### 2.4 既存テストでの参照箇所

- `test/test_reset_ux_partial_reset.js`
  - L309 / L320 / L375-376: `resetTournamentProgressOnly()` の `_showMsg('大会進行データをリセットしました','ok')` 呼出を mock 経由で assert（**部分側のみ**）
- `resetAll()` の `'リセットしました'` toast を **アサートしている既存テストは現状なし**
  - grep `'リセットしました'` で hit するのは `shogi_v4.html:5974` 本体 / アーカイブ 2 件のみ
  - `test/test_reset_ux_partial_reset.js` の `resetAll()` 振る舞いテスト（HANDOFF.md 既存記載 L209-218）は confirm 文言 / ボタン文言を見ており toast は assert していない
- `test/e2e/shogi_phase2_import.spec.js`
  - L510-526（PR #118 で `大会データを全リセット` に追従更新済）: ヘッダーボタン textContent と押下後の state.players / マスタ不変を確認、**完了 toast 文字列は assert していない**

### 2.5 既存 VRT スナップショットの対象

`test/e2e/visual_regression_mobile.spec.js-snapshots/` 配下に存在するのは以下のみ:

- `mobile-pp-panel-3sections-375-mobile-375-{darwin,linux}.png` — 過去参加者パネル（3 セクション、長氏名）
- `mobile-master-edit-modal-375-mobile-375-{darwin,linux}.png` — F7 編集モーダル
- `mobile-master-list-5cols-375-mobile-375-{darwin,linux}.png` — マスタ一覧 5 列構成

**`#reg-msg` toast を直接撮っている snapshot は存在しない**。`resetAll()` 完了 toast は `pane-reg` 上部 `#reg-msg` に表示され、上記 3 snapshot はそれぞれ過去参加者パネル / F7 編集モーダル / マスタタブのため、**完了 toast 文言変更によって VRT に直接的差分は出ない見込み**（toast は撮影タイミングと別フローで現れる）。

---

## 3. 問題設定

### 3.1 操作前・確認時・操作後の語彙非対称

- 操作前（ボタン）: 「大会データを **全リセット**」（PR #118 で明示）
- 確認時（confirm）: 「参加者一覧・組み合わせ・勝敗結果を含む大会データを **すべてリセット** します。」（PR #118 で明示）
- 操作後（toast）: 「リセットしました」 — **「全」「すべて」「大会データ」のいずれも入っていない**

PR #114（部分側）では「大会進行データをリセット」→「大会進行データをリセットしました」と **操作前・操作後で語彙完全一致** している。これに対し PR #118（全側）はボタン・confirm を更新したが toast は据え置きで、**操作前後の対称性が崩れたまま**。

### 3.2 部分リセット toast との混同リスク

- 部分: 「**大会進行データを**リセットしました」（11 文字相当）
- 全: 「リセットしました」（8 文字相当） — **目的語なし**

運営者が toast だけを目視確認した場合、「リセットしました」は短すぎて「何を」リセットしたか分からない。**特に直前操作を見落とした / 第三者運営者が交代で見たケース** で「部分なのか全なのか」が toast から判別できない。PR #116 で `removePlayer` alert が「大会進行データをリセット」へ明示誘導された結果、運営者の目線は「部分」が標準動線になっており、その文脈で短い「リセットしました」だけが出ると **無意識に「進行データのリセットだったか」と誤解される** 余地がある。

### 3.3 destructive 操作完了後の事実告知としての弱さ

- `resetAll()` は `localStorage.removeItem(STORAGE_KEY)` + 全 state 初期化を伴う **元に戻せない destructive 操作**
- 操作前後で破壊度の重みが連続するべきで、toast「リセットしました」は **操作の意味づけが薄く事務的すぎる**
- 一方で toast は数秒〜次の `showMsg` までの一過性表示なので、destructive 警告を再度繰り返す必要はない — **事実告知（何をリセットしたか）+ 簡潔さ** のバランスが問われる

### 3.4 マスタ全消去 toast との並びでの違和感（参考）

- マスタ全消去（[L2380](../../shogi_v4.html)）: 「**マスタを**リセットしました(全 member 消去)」 — 目的語 + 補足あり
- 部分: 「**大会進行データを**リセットしました」 — 目的語あり
- 全: 「リセットしました」 — **目的語なし**

3 種の reset 系 toast の中で全リセットだけが目的語を欠いており、コードベース全体の文体としても非対称になっている。

---

## 4. 文言案 A〜E の比較

下表の「文字数」は `showMsg` の `text` 引数全角換算（句点含む）。`#reg-msg` の表示幅（`.alert` の padding 込みで実機 375px なら横幅 350px 程度）に対し、いずれも 1 行で収まる範囲。

### 4.1 案 A: 現状維持

| 項目 | 内容 |
|---|---|
| toast | `リセットしました`（8 文字） |
| メリット | 変更ゼロ / 既存テスト・E2E・VRT 影響なし / 簡潔 |
| デメリット | 操作前後で語彙非対称 / 部分 toast「大会進行データをリセットしました」との対称性なし / 目的語なしで「何を」が toast から読めない / PR #118 で意図的に残した残論点を閉じきれない |

### 4.2 案 B: 全リセットしました

| 項目 | 内容 |
|---|---|
| toast | `全リセットしました`（9 文字） |
| メリット | 1 文字増で最小 / `#resetBtn` の「全リセット」と語彙一致 / 「全」が破壊度の続報として残る |
| デメリット | 目的語（大会データ）が依然なし / 「全リセット」が単独だと「何を」が暗黙 / 部分 toast「**大会進行データを**リセットしました」との構造非対称（目的語ありなし） |

### 4.3 案 C: 大会データを全リセットしました（推奨第一候補）

| 項目 | 内容 |
|---|---|
| toast | `大会データを全リセットしました`（15 文字） |
| メリット | `#resetBtn`「大会データを **全リセット**」と語彙完全一致 / 部分 toast「**大会進行データを** リセットしました」との **「進行」有無による対称対比** が明確（部分 = 目的語に「進行」、全 = 目的語に「全」修飾を inline で内包し、目的語そのものは「大会データ」） / 目的語ありで「何を」が toast から読める / PR #117 design doc §10.3 / PR #118 HANDOFF entry が「等」付きで候補に挙げていた文字列そのもの |
| デメリット | 8 → 15 文字と 2 倍弱に伸びる（ただし `#reg-msg` で 1 行に収まる） / 「全リセットしました」の語感が動詞由来の「全 + リセット」連結で若干硬い |

### 4.4 案 D: 大会データをリセットしました

| 項目 | 内容 |
|---|---|
| toast | `大会データをリセットしました`（13 文字） |
| メリット | 部分 toast「大会進行データをリセットしました」との **「進行」有無のみによる対称対比**（最も構造が揃う） / 目的語ありで自然な日本語 / 旧 ボタン名「大会データをリセット」由来で違和感少 |
| デメリット | **「全」が消える** → PR #118 で `#resetBtn`「大会データを全リセット」に揃えた語彙整合が部分的に崩れる / 「進行」の有無だけで部分・全を区別する設計に戻る = PR #118 が乗り越えようとした類似文言問題の **toast 段階での再来** / 操作前（全リセット）と操作後（リセット）で「全」の脱落が発生 |

### 4.5 案 E: 大会データを全てリセットしました

| 項目 | 内容 |
|---|---|
| toast | `大会データを全てリセットしました`（16 文字） |
| メリット | confirm 文言「**すべて**リセットします」との語彙準対称（confirm はひらがな「すべて」、toast は漢字「全て」） / 自然な完了文 |
| デメリット | confirm が「すべて」（ひらがな）なのに toast が「全て」（漢字）で表記揺れ → 修正すれば対称になるが、PR #118 の confirm 文言（既に main 着地）を触らないと整合しない / ボタン「全リセット」とは語の連続性が下がる（「全」だけ抜き出される） / 16 文字 |

### 4.6 案 F（参考、追加検討）: 大会データをすべてリセットしました

| 項目 | 内容 |
|---|---|
| toast | `大会データをすべてリセットしました`（17 文字） |
| メリット | confirm 文言「**すべて**リセットします」と **完全に同じ「すべて」（ひらがな）** で語彙対称 / 自然な完了文 |
| デメリット | ボタン「全リセット」とは語が分離（「全」と「すべて」の使い分けが発生） / 17 文字とやや長い / PR #118 の confirm 設計を参照しないと整合性が読み取りにくい |

---

## 5. 比較観点マトリクス

| 観点 | A: リセットしました | B: 全リセットしました | **C: 大会データを全リセットしました** | D: 大会データをリセットしました | E: 大会データを全てリセットしました | F: 大会データをすべてリセットしました |
|---|---|---|---|---|---|---|
| 意味の明確さ | △（目的語なし） | △（目的語なし） | **◎** | ◯ | ◯ | ◯ |
| 全 / 部分の区別 | ✗ | ◯ | **◎** | △（「進行」有無のみ） | ◯ | ◯ |
| `#resetBtn`「大会データを全リセット」との語彙整合 | ✗ | ◯（「全リセット」一致） | **◎**（完全一致） | △（「全」抜け） | △（「全て」と「全」の差） | △（「すべて」と「全」の差） |
| confirm「すべてリセットします」との語彙整合 | ✗ | △ | ◯（「全」「すべて」の対応） | △ | △（「全て」漢字 vs ひらがな） | **◎**（「すべて」一致） |
| 部分 toast「大会進行データをリセットしました」との構造対称 | ✗ | △ | **◎**（修飾語「進行」vs「全」の対比、目的語あり） | **◎**（修飾語有無のみ） | ◯ | ◯ |
| 日本語としての自然さ | ◯ | △（「全リセット」単独は硬め） | ◯ | ◎ | ◯ | ◎ |
| toast としての短さ | ◎（8 字） | ◎（9 字） | ◯（15 字） | ◯（13 字） | △（16 字） | △（17 字） |
| 既存テスト影響 | なし | shogi_v4 のみ | shogi_v4 のみ | shogi_v4 のみ | shogi_v4 のみ | shogi_v4 のみ |
| VRT 影響 | なし | なし見込み | なし見込み | なし見込み | なし見込み | なし見込み |
| E2E 影響 | なし | なし | なし（既存 E2E は toast を assert していない） | なし | なし | なし |
| 実装変更量 | 0 | 1 行 | 1 行 | 1 行 | 1 行 | 1 行 |
| 現場運用者の判別力 | △ | ◯ | **◎** | ◯ | ◯ | ◯ |

---

## 6. 推奨案

### 6.1 第一推奨: 案 C「大会データを全リセットしました」

**結論**: 後続 IMPL-LIGHT の第一推奨は **案 C**。

- toast: `大会データを全リセットしました`
- 呼出: `showMsg('大会データを全リセットしました','ok')`（[shogi_v4.html:5974](../../shogi_v4.html)）

### 6.2 採用理由

1. **`#resetBtn`「大会データを全リセット」との語彙完全一致**: 操作前（ボタン）→ 操作後（toast）の語彙が連続し、「全リセット」の語が押下時から完了時まで一貫して残る
2. **部分 toast「大会進行データをリセットしました」との構造対称**: 「**進行** データを **（無修飾）** リセットしました」（部分） vs 「**（無修飾）** データを **全** リセットしました」（全）の対比が読みやすく、目的語「大会データ」が両方に存在する形に揃う
3. **目的語ありで「何を」が toast から読める**: 第三者運営者・直前操作を見落とした人が toast だけ見ても「全リセット」が完了したと分かる
4. **PR #117 design doc §10.3 / PR #118 HANDOFF entry の予告通り**: 後続候補として「大会データを全リセットしました」「等」が既に文献に登場、運営者・Codex・cowork の事前合意ラインに乗せやすい
5. **destructive 完了の事実告知として適切**: 案 A の「リセットしました」より目的語と修飾語が乗るが、案 E / F のように confirm 文言を反復しすぎず、toast の一過性表示としての簡潔さも保てる
6. **実装スコープが「文言 1 行変更 + （任意）軽量テスト追加」に閉じる**: ロジック変更ゼロ、ボタン id 不変、DOM 構造不変、CSS 不変、VRT 影響なし見込み

### 6.3 代替候補の位置づけ

- **案 D**（大会データをリセットしました）: 「進行」有無だけで部分・全を区別する設計に戻り、PR #118 で乗り越えた類似文言問題が toast に再来する。`#resetBtn` の「全」表記との非対称も発生するため次善
- **案 F**（大会データをすべてリセットしました）: confirm 文言「すべてリセットします」との語彙整合は最も高いが、ボタン側「全」との分離が起こる。confirm 主導なら案 F、ボタン主導なら案 C の判断。**ボタンが最も視認頻度の高い destructive 入口** であることを考えると、ボタン主導の案 C を上位とする。ただし「すべて」表記統一を強く望む立場（Codex / 運営者）から案 F 推奨が出た場合は案 C の固執は不要
- **案 B**（全リセットしました）: ボタン整合は確保するが目的語が抜けるため案 C の劣化版
- **案 E**（大会データを全てリセットしました）: 「全て」漢字 / 「すべて」ひらがなの表記揺れがコードベース全体に波及するため、表記統一を含む別 PR が必要になり IMPL-LIGHT のスコープを越える
- **案 A**（現状維持）: PR #117 / #118 まで進めた対称化の最後の 1 ピースを残すため、後続観察フェーズに有用な情報を生まない。選びにくい

### 6.4 暫定推奨の保留条件

- 実機（mobile 375px Safari / Pixel 5 360px）で `#reg-msg` 表示時に 15 文字が **2 行折り返し** を起こすと判明した場合 → 案 B（9 文字）へフォールバック
- Codex / cowork レビューで「ボタン主導の `全` と confirm 主導の `すべて` の混在は許容できない」と表記統一が強く求められた場合 → confirm 文言を含めて再設計する別 design へ送る（本 design は閉じる）

---

## 7. IMPL-LIGHT スコープ

### 7.1 やる候補（後続 `RESET-UX-TOAST-LABEL-IMPL-LIGHT` 想定）

- [`resetAll()`](../../shogi_v4.html) [L5974](../../shogi_v4.html) の `showMsg('リセットしました','ok')` を `showMsg('大会データを全リセットしました','ok')` に更新
- 軽量テスト追加（任意、`test/test_reset_ux_toast_label.js` 新規 stanza または既存テスト 1 件への 1 アサート追加）:
  - `resetAll()` 関数本体に `showMsg('大会データを全リセットしました','ok')` の文字列リテラルが存在する（regex `/showMsg\(\s*['"]大会データを全リセットしました['"]/`）
  - 旧文言 `showMsg('リセットしました','ok')` がコード上に **存在しない**（regex 否定）
  - `resetTournamentProgressOnly()` 側の `showMsg('大会進行データをリセットしました','ok')`（[L5942](../../shogi_v4.html)）が **不変**
  - 上記いずれかが満たされる軽量静的検査 1 stanza で十分（振る舞いテストは現状 `resetAll()` の toast 経路を mock していないため過剰）
- HANDOFF.md に 1 行 entry 追加
- 本 design doc 末尾に IMPL-LIGHT 実装着地メモ section を後追いで追記（§9 placeholder）

### 7.2 やらない候補

- [`resetAll()`](../../shogi_v4.html) [L5945](../../shogi_v4.html) の **初期化ロジック自体** の変更（PR #117 / #118 確定の不変項目を維持）
- [`resetAll()`](../../shogi_v4.html) [L5946](../../shogi_v4.html) の **confirm 文言** の変更（PR #118 確定済み）
- [`#resetBtn`](../../shogi_v4.html) [L100](../../shogi_v4.html) **ボタン文言** の変更（PR #118 確定済み「大会データを全リセット」）
- [`resetTournamentProgressOnly()`](../../shogi_v4.html) [L5924](../../shogi_v4.html) の仕様 / confirm / 完了 toast の変更
- [`#resetProgressBtn`](../../shogi_v4.html) [L101](../../shogi_v4.html) 文言の変更
- [`removePlayer()`](../../shogi_v4.html) [L3761](../../shogi_v4.html) alert 文言（PR #116 確定文）の変更
- [`startTournament()`](../../shogi_v4.html) [L4429](../../shogi_v4.html) guard alert 文言（PR #112 / PR #114 同期更新確定文）の変更
- [shogi_v4.html:2380](../../shogi_v4.html) `マスタをリセットしました(全 member 消去)` の文言変更（別機能、別タスク）
- `showMsg` 本体（[L3096](../../shogi_v4.html)）の構造変更 / 表示時間 / 色 / aria-live 強化 / トースト挙動変更
- localStorage schema / `STORAGE_KEY` / `LEGACY_STORAGE_KEYS` / `BRANCH_MASTER_KEY` 変更
- pairing algorithm / Fisher-Yates / `generatePairing` / `evaluatePairingQuality` / `warning object` の変更
- `normalizeState` / `save()` / `load()` の挙動変更
- 自動バックアップ機能 / undo 機能 / 専用モーダル化 / confirm 連鎖（2 段階確認）
- ボタン並び替え / ボタン色変更 / CSS / layout 変更
- VRT snapshot 自律更新 / threshold 緩和 / VRT skip / CI 設定変更
- `package.json` / `package-lock.json` / `playwright.config.js` / `docs/specs/` / `.github/workflows/` の変更
- `index.html` / `data/` の変更

---

## 8. テスト方針

### 8.1 静的検査（任意の新規テスト stanza）

| 観点 | 確認内容 | 対象テスト |
|---|---|---|
| `resetAll()` toast 文言 | 関数本体に `showMsg('大会データを全リセットしました','ok')` が存在 | 新規 `test/test_reset_ux_toast_label.js`（任意）または `test/test_reset_ux_partial_reset.js` 既存末尾への 1 アサート追加 |
| 旧 toast 文言の不存在 | `showMsg('リセットしました','ok')` が **コード上に存在しない**（誤って残置していない） | 同上 |
| `resetTournamentProgressOnly()` toast 不変 | `showMsg('大会進行データをリセットしました','ok')` が `resetTournamentProgressOnly` 関数本体に存続 | 同上 |
| マスタ toast 不変 | [L2380](../../shogi_v4.html) `showMsg('マスタをリセットしました(全 member 消去)','ok')` が不変（別機能影響なし） | 同上 |
| `resetAll()` ロジック不変 | `state={players:{A:[],B:[]},...}` 一括代入 / `localStorage.removeItem(STORAGE_KEY)` / 大会報告書欄クリア / `shogi_branch_master` 維持 がすべて残る | コード構造 grep（既存 `test/test_reset_ux_partial_reset.js` カバー部分で十分） |

### 8.2 振る舞いテスト（E2E）

- `test/e2e/shogi_phase2_import.spec.js` L510-526（PR #118 着地済の `大会データを全リセット` describe）は **toast 文字列を assert していないため追従更新不要**
- 他に `resetAll()` 完了 toast を locator にもつ E2E は **現状なし**（grep `'リセットしました'` で test/e2e/ にヒットなし）
- 本 IMPL-LIGHT で **新規 E2E は追加しない**（toast 表示の playwright VRT は既存スイートに存在せず、追加コストが本タスクの軽さに見合わない）

### 8.3 VRT 方針

- 既存 VRT snapshot 3 種は `#reg-msg` 上の toast を撮影していないため、**直接の VRT 影響は出ない見込み**
- IMPL-LIGHT 着手時の `npm run test:e2e:visual` で念のため red の有無を確認
- 万一 red が出た場合は **自律更新せず差分を目視確認**、`#reg-msg` 文字列差分のみと判断できた場合のみ運営者（user）に明示許可を得てから snapshot 更新
- **threshold 緩和 / VRT skip / CI 設定変更は禁止**（PR #114 / PR #118 と同じガードライン）

---

## 9. VRT / E2E 影響

### 9.1 VRT への影響可能性

- 既存 VRT snapshot 3 種の直接対象（過去参加者パネル / F7 編集モーダル / マスタ一覧 5 列）は **toast 表示 `#reg-msg` を含まない**
- toast は `resetAll()` 完了直後の `pane-reg` 表示時に一時的に出るが、上記 snapshot の撮影タイミングは reset 完了直後ではない
- 文言 1 行変更のみで DOM 構造・CSS class・配置すべて不変 → **VRT への間接差分も発生しにくい**

### 9.2 E2E への影響

- `resetAll()` 完了 toast の文字列を locator にもつ E2E は **現状ゼロ**（`grep -rn "'リセットしました'\|'大会データをリセットしました'\|'大会データを全リセットしました'" test/e2e/` で hit なし）
- PR #118 で更新された `test/e2e/shogi_phase2_import.spec.js` も toast 自体は assert していない（押下後の state.players / マスタ不変のみ）
- IMPL-LIGHT 着地で E2E への影響は **発生しない見込み**

### 9.3 表示幅 / mobile 折り返し

- `#reg-msg` の `.alert` クラスは `pane-reg` 直下、横幅は実機 375px で padding 込み 350px 程度
- 案 C 15 文字（全角換算 30 px 文字幅相当）× 文字数 = 約 225 px 程度 → **1 行に収まる見込み**
- 案 E / F（16-17 文字）でも余裕あり、案 A / B（8-9 文字）は当然問題なし
- 実機確認は IMPL-LIGHT 着地時に念のため Mobile Safari 375px / Pixel 5 360px で 1 行表示を目視推奨

---

## 10. リスク

### 10.1 文言面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 「全リセット」の語感 | 「全」が破壊度を再強調しすぎ、toast の一過性表示としてはやや重い | 案 C は `#resetBtn` 同じ語を使うのみで destructive 警告（`btn-danger` の赤・confirm 文言）と二重化していない、toast 自体は `'ok'` 緑系で完了確定の中立トーン |
| 「全」と「すべて」の表記揺れ | ボタン・toast =「全」、confirm =「すべて」で表記が混在 | 案 C ではボタンと toast を「全」で揃えることを優先（confirm「すべて」は PR #118 確定済で本 design ではスコープ外）。Codex 指摘があれば §6.4 の保留条件で案 F に切り替える判断軸を持つ |
| 部分 toast との対称性破綻 | 部分「大会進行データをリセットしました」 vs 全「大会データを全リセットしました」で **修飾語位置が逆**（部分は目的語の中、全は動詞前）に見える | これは「進行データ」が独立した固有概念（限定された範囲）であり、「全」は動作の修飾（リセットの範囲）であるという日本語の自然な使い分けで、運営者には違和感少ない見込み。観察フェーズで確認 |
| 「大会データを全リセット」は会話的に違和感 | 「全データをリセット」の方が自然との指摘可能性 | ボタン「大会データを全リセット」が既に PR #118 で main 着地済み、整合のため toast も同表現を採用。観察後に IMPL-MEDIUM で再検討 |

### 10.2 実装面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 軽量テスト過剰 | 静的検査 1 行のために新規ファイルを作るのは重い | 既存 `test/test_reset_ux_partial_reset.js` 末尾に 1 stanza 追加 or 新規 1 ファイルどちらでも可、IMPL-LIGHT 時に粒度を判断 |
| `showMsg` 経路の上書き挙動 | `resetAll()` 完了直後に別の `showMsg` が走るケース（renderRegList 経由など）で toast が即上書きされる可能性 | 現状 `resetAll()` は最終行で `showMsg` を呼び出し、その後ロジックはない（[shogi_v4.html:5957-5974](../../shogi_v4.html) で確認）。renderRegList → showTab → showMsg の順、showTab 内で `showMsg` を再呼出しない（`showTab` 自体は `#reg-msg` 触らず） |
| VRT 想定外差分 | toast が偶然 snapshot 撮影タイミングと重なって差分が出る | §8.3 / §9.1 の手順（自律更新せず判断仰ぐ）でカバー |
| Codex / cowork レビュー指摘 | 「リセットしましたで十分」「冗長」のスタイル指摘 | 本 design doc §6.2 の採用理由を提示できるよう判断ログを残しておく。否定意見が強い場合は案 A 維持で本 design を closure |

### 10.3 運用面のリスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| 慣れ問題 | 既存「リセットしました」に慣れた運営者が、新文言で一瞬戸惑う | 文言が長くなる方向の変更で「より明確になった」と受け取られやすい。リリース後の運用観察項目に「toast 視認性 / 違和感」を含める |
| 重要視されなかった場合 | toast は一過性で運営者がそもそも見ていない可能性 | 本 design は「見ていないなら現状維持で良い」案 A も認める。観察結果次第で IMPL-LIGHT 自体を不要と判断する余地を残す |

---

## 11. 後続タスク候補

### 11.1 即起票可能（IMPL-LIGHT）

- **`RESET-UX-TOAST-LABEL-IMPL-LIGHT`** — 本 design doc §6.1 第一推奨を着地させる実装 PR。スコープは §7、テスト方針は §8、VRT 方針は §8.3。**main 起点ではなく必ず本 design doc PR squash merge 後の main から派生**

### 11.2 観察フェーズ（IMPL-LIGHT 着地後）

- **運用観察**: 新 toast 文言で運営者の操作後確認が改善されるか / 「全リセット」の語感が運用上重すぎないか / 部分 / 全の toast 差分（「進行」 vs 「全」修飾）が直感的に伝わるか
- 観察結果次第で:
  - **`RESET-UX-TOAST-LABEL-IMPL-MEDIUM`**（仮）= 案 E / F 相当の「すべて」表記統一 + confirm 文言再調整への移行
  - **`RESET-UX-TOAST-LIFECYCLE-DESIGN`**（仮）= toast の自動消去 / 出現時間 / aria-live 強化など `showMsg` 仕組み側の改善

### 11.3 関連タスク候補（独立）

- **`RESET-UX-FULL-RESET-LABEL-IMPL-MEDIUM`**（仮、PR #117 §10.2 既出）: 案 E 強表現（「参加者も含めて全リセット」/「この操作は元に戻せません」）への移行 — 運用観察次第
- **`RESET-UX-FULL-RESET-PLACEMENT-DESIGN`**（仮、PR #117 §10.2 既出）: `#resetBtn` のヘッダーからの撤去 / 設定タブへの隔離など、配置レベルの見直し
- **`REMOVE-PLAYER-GUARD-MESSAGE-IMPL-MEDIUM`**（仮）: 削除不可 alert を案 E 自動連鎖へ移行する別系統タスク
- **`RESET-UX-PARTIAL-RESET-IMPL-MEDIUM`**（仮、PR #113 §15 既出）: 部分リセットの案 E モーダル選択化

### 11.4 やらない / 観察待ち

- pairing algorithm 変更 / `evaluatePairingQuality` 変更
- localStorage schema 変更 / 大会履歴保存
- undo / 自動バックアップ / 専用モーダル化
- ボタン色変更 / CSS / layout 変更
- VRT snapshot 自律更新 / threshold 緩和

---

## 12. レビュー観点（後続 Codex / ChatGPT 確認用）

1. **語彙整合**: 案 C「大会データを全リセットしました」が `#resetBtn`「大会データを全リセット」/ confirm「大会データをすべてリセットします」と整合しているか（「全」と「すべて」の混在許容範囲）
2. **部分 toast との対称性**: 「大会進行データをリセットしました」と「大会データを全リセットしました」の対比が運営者に直感的に伝わるか
3. **toast 表示幅**: mobile 375px Safari で 15 文字が 1 行に収まるか（IMPL-LIGHT 着地時に実機確認）
4. **テスト粒度**: §8.1 の軽量静的検査 1 stanza で十分か、振る舞いテストを追加すべきか
5. **VRT 影響**: §8.3 / §9.1 の見込み通り直接差分が出ないか
6. **代替候補の妥当性**: §6.3 の案 D / F / B の比較が網羅的か、案 F へのフォールバック判断軸（§6.4）が明確か
7. **スコープ閉じ込め**: PR #117 / #118 で確定したボタン・confirm 文言、PR #114 で確定した部分側 toast に touch していないか
8. **後続タスク連鎖**: IMPL-LIGHT 着地後の運用観察 → IMPL-MEDIUM / LIFECYCLE-DESIGN への移行条件が明確か

---

## 13. 結論

- PR #118 で意図的に維持された `resetAll()` 完了 toast「リセットしました」は、`#resetBtn`「大会データを全リセット」/ confirm「すべてリセットします」と **操作前後の語彙が非対称** になっており、部分 toast「大会進行データをリセットしました」との **構造対称性も欠けたまま**
- 6 案の比較の結果、後続 IMPL-LIGHT の第一推奨は **案 C「大会データを全リセットしました」**
- 実装スコープは「`shogi_v4.html` 1 行変更 + （任意）軽量静的検査 1 stanza + HANDOFF entry」に閉じ、ロジック変更ゼロ / VRT 影響なし見込み / E2E 影響なし
- 後続は `RESET-UX-TOAST-LABEL-IMPL-LIGHT` を即起票可能、その後は運用観察を経て IMPL-MEDIUM / LIFECYCLE-DESIGN / 配置見直しなどへ進む

---

## 14. 着地後追記用 placeholder

IMPL-LIGHT 着地時に以下を埋める想定:

- IMPL-LIGHT PR 番号 / squash SHA
- 採用された最終文言（design doc §6.1 と差異あれば差分を明記）
- VRT snapshot 差分有無と更新可否判断
- 実機確認結果（mobile 375px / 360px の toast 1 行表示有無）
- 運用観察フェーズの開始日と観察項目
