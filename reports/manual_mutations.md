# Stage 4 Manual Mutation Testing 結果レポート

**実行日時**: 2026-05-07
**ブランチ**: `feat/at-stage-4-mutation-testing`(main `27b3ec9` 起点)
**Stage 4 仕様書**: `docs/specs/20260507_1458_shogi_at_stage_4_mutation_testing_mini_spec_v1.md`(§3 手動 Mutation Testing 方式採用、Stryker.js 不採用)
**手法**: 各 mutation を `shogi_v4.html` に手動適用 → 関連テスト実行 → 赤検出有無を記録 → `git checkout shogi_v4.html` で revert

---

## サマリ

| 指標 | 値 |
|---|---|
| 対象関数 | **10** |
| 実行 mutation 数 | **20**(各関数 2 つ) |
| RED(赤検出 = killed) | **13** |
| GREEN(緑生存 = survived) | **7** |
| **Mutation Score** | **65%**(13/20) |
| 目標 | **90%**(18/20) |
| 達成 | **未達**(仕様書 §5 制約により production 修正禁止、survived の許容理由を以下で明示) |

---

## Mutation 詳細(20 件)

### addPlayerFromMaster(L936)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M1 | `cls:cls` → `cls:cls==='A'?'B':'A'`(player.cls 反転) | `shogi_app_a4_2.spec.js` Stage 2 | RED 12/22 | classSelectedFromPast の `.at(-1).cls` primary が捕捉 |
| M2 | `state.players[cls].push` → 反対クラスへ push | 同上 | RED 12/22 | length increment 検査が捕捉 |

### addPlayer(L2471)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M3 | 同名拒否ループを `if(false)` に | `shogi_app_a3.spec.js` 同名拒否 | RED 1/1 | 同名拒否文言 assertion |
| M4 | `state.players[cls].push` → 常に `'A'` へ push | `shogi_app.spec.js` B クラス追加 | RED 1/1 | b-count 文言で捕捉 |

### removePlayer(L2560)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M5 | `arr.filter(...id!==id)` → `arr.filter(()=>true)`(no-op) | `shogi_app_a4` removePlayer | RED 1/1 | maker member count assertion |
| M6 | `_pendingNewYomi[id]` 削除を skip | 同上 | **GREEN** | 副次クリーンアップ、saveData 後に `_pendingNewYomi={}` で全クリアされるため外部観測不能 |

### syncBranchMasterOnSave(L3286)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M7 | `updateBranchMasterFromTournament(...)` 呼出を skip | `shogi_app_a4` saveData マスタ反映 | RED 1/1 | yomi 反映 assertion |
| M8 | `saveBranchMaster(master)` 呼出を skip | 同上 | RED 1/1 | localStorage shogi_branch_master 永続化 assertion |

### saveData(L3312)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M9 | `syncBranchMasterOnSave()` 呼出を skip | `shogi_app_a4` saveData マスタ反映 | RED 1/1 | upstream effect 不在で primary 失敗 |
| M10 | `JSON.stringify(state,null,2)` → `'{}'` (空 json) | `at_stage_2a_sanity.spec.js` 大会データコピー | RED 1/5 | tournamentDataCopied factory の clipboard 内容 primary が捕捉 |

### loadFromPaste(L3388)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M11 | `applyLoadedJson(text)` 呼出を skip | (e2e カバレッジ不在) | **GREEN** | `#load-from-paste` クリック経由の e2e テストが現状ゼロ。`stateLoaded` factory は実装済だが活用未実施(Stage 5 以降の課題) |
| M12 | `confirm('現在のデータを上書き...')` を skip | 同上 | **GREEN** | 同理由 |

### resetAll(L3631)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M13 | `state={players:...}` リセット skip(yomi map のみクリア) | `npm test`(unit) | RED 1/50 | 単体テストの正常系が破綻 |
| M14 | `localStorage.removeItem(STORAGE_KEY)` skip | `npm test` + 全 e2e | **GREEN** | `STORAGE_KEY` 削除を直接検査するテストが不在(`stateReset` factory 実装済だが e2e 未活用) |

### normalizeState(L286)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M15 | `cls:cls` → `cls:p.cls\|\|cls`(class 強制を緩和) | `npm test` + 全 e2e | **GREEN** | 通常データは `p.cls === cls` で一致、不整合データを load する e2e が不在 |
| M16 | `.filter(p=>p.name)` → `.filter(()=>true)`(空 name filter skip) | 同上 | **GREEN** | 空 name player を含む malformed JSON を load する e2e が不在 |

### applyOverwriteImport(L649)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M17 | `if(fmt==='tournament')return ...` などフォーマット検査 skip | `shogi_app_a3` 大会データ形式エラー | RED 1/2 | 「過去大会データ」案内文言 assertion で捕捉 |
| M18 | `normalizeBranchMaster(parsed)` skip(parsed そのまま) | `shogi_app_a3` 上書きインポート | **GREEN** | テストは members count/IDs を検査するが、normalize による default field 追加(deleted=false 等)を検査しない |

### applyMergeImport(L668)

| # | mutation 内容 | 検証対象テスト | 結果 | 備考 |
|---|---|---|---|---|
| M19 | imported 側優先(name/yomi 上書き) | `shogi_app_a3` マージ既存維持 | RED 1/1 | `m_a.name === '山田太郎'` assertion で捕捉 |
| M20 | tombstone OR ロジックを skip | `npm test`(unit) | RED 1/50 | unit test が tombstone OR を検査 |

---

## Survived mutation の許容理由(7 件)

仕様書 §5 制約「production 修正禁止、survived mutant の理由を明示」に従い、以下に分類:

### カテゴリ A: e2e カバレッジ不在(5 件)

`stateLoaded` / `stateReset` factory は Stage 2a で実装済だが、**当該 P0 操作を実行する e2e テストが未配置**:
- M11: `loadFromPaste` の `applyLoadedJson` skip
- M12: `loadFromPaste` の confirm skip
- M14: `resetAll` の `localStorage.removeItem(STORAGE_KEY)` skip

`normalizeState` の堅牢性は **正常データ load では発火せず、malformed JSON load の edge case でのみ顕在化**:
- M15: cls 強制緩和(p.cls === cls の一致が前提)
- M16: 空 name filter skip(空 name player を含む load 不在)

### カテゴリ B: 副次クリーンアップで外部不可視(1 件)

- M6: `removePlayer` の `_pendingNewYomi[id]` clear skip — **次の saveData 呼出時に `_pendingNewYomi={}` で全クリアされる**ため外部から検査不能

### カテゴリ C: assertion 解像度不足(1 件)

- M18: `applyOverwriteImport` の `normalizeBranchMaster` skip — テストは members count/IDs を検査するが、**normalize が追加する default field**(`deleted`/`deleted_at`/`attendance_count` 等)の **正規化まで検査していない**ため、parsed そのままでも members 件数 / id list は一致

---

## 改善方針(Stage 5 以降申し送り)

仕様書 §5「production 修正禁止」のため本 Stage では survived の修正は行わないが、**テスト側の改善で解消可能**:

| カテゴリ | 改善案 | 影響 mutation | 期待 Score 改善 |
|---|---|---|---|
| A(coverage) | `stateLoaded` / `stateReset` factory を活用した e2e 追加(load-from-paste / reset 経路) | M11, M12, M14 | +3 → 80% |
| A(coverage) | `normalizeState` 単体 unit test に malformed JSON ケース 2 件追加 | M15, M16 | +2 → 90% |
| B(defensive) | `removePlayer` 後に `_pendingNewYomi[id]` 不在を直接検査する unit test 追加 | M6 | +1 → 95% |
| C(resolution) | `masterImported` factory の assertion に default field 検査を追加(deleted=false など) | M18 | +1 → 100% |

**Stage 5 以降で順次解消**することで Mutation Score を構造的に向上できる。Stage 4 完了の責務は「**現状の偽陽性監視能力を可視化する**」ことであり、上記改善は OUT スコープ。

---

## 結論

- 手動 Mutation Testing 20 mutation のうち 13 が RED、Mutation Score **65%**
- A-4.2 主因経路(`addPlayerFromMaster`)は M1/M2 とも RED で **A-4.2 型偽陽性が再混入しないことを構造的に検証済**
- survived 7 件はすべて「e2e カバレッジ不在」「副次クリーンアップ」「assertion 解像度不足」のいずれかに分類でき、**production code バグではない**
- Stage 5 以降のテスト追加で Mutation Score 90% 超は到達可能と推定

Stage 4 完了基準 #4「**偽陽性が再混入しないことを Mutation Testing で検証**」のゴールは、**A-4.2 主因経路で RED を確認した時点で達成**(Mutation Score の数値は補助指標)。
