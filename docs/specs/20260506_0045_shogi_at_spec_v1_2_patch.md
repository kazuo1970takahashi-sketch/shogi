# A-T 仕様書 v1.2 への追記パッチ（v1.2.5 §2.2 L4 反映）

**作成日時**: 2026-05-06 00:45 JST
**対象**: docs/specs/20260505_2046_shogi_at_spec_v1.md（v1）
**目的**: A-T spec v1 を v1.2 に更新し、v1.2.5 §2.2 L4 で確定した primary semantic assertion 必須化等を反映する
**適用方法**: Claude Code が本パッチに従って v1 を編集し、新ファイル `20260506_0045_shogi_at_spec_v1_2.md` として配置（v1 はアーカイブ）

---

## 変更点サマリ

| # | 章 | 変更内容 | 根拠 |
|---|------|--------|------|
| A | §0 経緯と背景 末尾 | v1.2.5 確定の追記 | v1 起草後に v1.2.5 が確定したため |
| B | §4.2 expectClickable ヘルパ仕様 | 5 点 hit-test に強化、force: true 禁止明記、CSS 踏み抜き要因の検証追加 | v1.2.5 §2.2 L4 |
| C | §4.3 clickAndExpectChange ヘルパ仕様（**新設**） | primary semantic assertion 必須化、shogi 固有 assertion 例を明示 | v1.2.5 §2.2 L4（v2.2.1 確定版） |
| D | §5 Stage 2 完了基準 | 「primary assertion 宣言済み」を追加 | v1.2.5 §2.2 L4 |
| E | §5 Stage 4 完了基準 | 「A-4.2 回帰テストの primary assertion で赤」を追加 | v1.2.5 §2.2 L4 |
| F | §6 受け入れ基準 | 「v1.2.5 §2.2 L4 完全整合」を追加 | v1.2.5 採用 |
| G | 改訂履歴 | v1.2 行追加 | 標準運用 |

---

## 詳細パッチ

### A. §0 経緯と背景 末尾に追記

```markdown
**v1.2 改訂理由**：本仕様 v1 は 2026-05-05 20:46 起草。その後、A-4.2 リグレッションを根本的に防ぐためのゼロバグ宣言が 2026-05-06 00:33 に v1.2.5 として正式採用された。v1.2.5 §2.2 L4 で `clickAndExpectChange` ヘルパ仕様（primary semantic assertion 必須化等）が確定したため、本仕様もそれに整合する形で v1.2 に更新する。
```

---

### B. §4.2 `expectClickable` ヘルパ仕様の強化

**現行 v1（§4.2、85 行付近）**：
```javascript
async function expectClickable(locator) {
  // 1. toBeAttached() / toBeVisible() / toBeEnabled()
  // 2. CSS 計算値検証: pointerEvents !== 'none' / opacity > 0
  // 3. 5. ヒットテスト: elementFromPoint(centerX, centerY) が自身または子孫であることを検証
}
```

**v1.2 で以下に置換**：
```javascript
async function expectClickable(locator) {
  // 1. 物理的存在: toBeAttached() / toBeVisible() / toBeEnabled()
  // 2. scrollIntoViewIfNeeded で viewport 内に収める
  // 3. 矩形検証: rect.width/height > 0、viewport 内
  // 4. CSS 計算値検証:
  //    - pointer-events !== 'none'
  //    - opacity ≥ 0.5
  //    - visibility !== 'hidden'
  // 5. ancestor chain 検証:
  //    - display !== 'none'
  //    - visibility !== 'hidden'
  //    - inert 属性なし
  //    - aria-disabled !== 'true'
  //    - 祖先の disabled fieldset なし
  // 6. ヒットテスト（v1.2 で 5 点に拡張）:
  //    elementFromPoint で以下 5 点すべてが自身または子孫であることを検証
  //    - 中央
  //    - 四隅内側 4 点（rect.left+1, rect.top+1）等
  //    - これにより z-index・absolute オーバーレイ等の踏み抜きを構造的に検出
  // 7. CSS 由来の踏み抜き要因（pointer-events / visibility / z-index）も検証対象に含める
}
```

**重要な禁止事項**（v1.2 で明文化、v1.2.5 §2.2 L4 整合）：
- **L4 ヘルパ内では `force: true` の使用を禁止**
- これにより playwright が pointer-events: none を踏み抜くバグ（A-4.2 の根本原因）を構造的に防止

---

### C. §4.3 `clickAndExpectChange` ヘルパ仕様（**新設**）

**新章として §4.3 を追加**（§4.2 と §4.4 の間）：

```markdown
### 4.3 `clickAndExpectChange` ヘルパ仕様（v1.2 で新設、v1.2.5 §2.2 L4 整合）

#### 4.3.1 役割

`expectClickable` が「クリック前の物理的可能性」を検証するのに対し、`clickAndExpectChange` は「クリック後の意味的成功条件」を検証する。
A-4.2 リグレッションは「e2e は緑だが実機で動かない」という構造的欠陥に由来し、これを防ぐには **クリックが業務状態を変えたかを assert する** 必要がある。

#### 4.3.2 仕様

```javascript
async function clickAndExpectChange(locator, expectedChange) {
  // 1. クリック前検証
  await expectClickable(locator);
  
  // 2. クリック前 state スナップショット取得
  const beforeState = await getStateSnapshot(); // テスト側で定義
  
  // 3. クリック実行（force: true 禁止）
  await locator.click(); 
  
  // 4. クリック後 state スナップショット取得
  const afterState = await getStateSnapshot();
  
  // 5. expectedChange を検証
  await expectedChange(beforeState, afterState);
}
```

#### 4.3.3 primary semantic assertion 必須化

`expectedChange` には以下の **primary semantic assertion を 1 つ以上必須**で含める：

| 種類 | 内容 | 適用例 |
|------|------|--------|
| **状態変化** | `state` / `store` / `global vars` の差分 | `state.players[lastIndex].cls === 'A'` |
| **DOM 変化** | 要素追加・削除・属性変化（DOM が業務状態を反映する場合） | 登録者一覧の `<li>` 行追加 |
| **永続化変化** | localStorage / IndexedDB / cookie の差分 | 保存ボタン: `JSON.parse(localStorage.getItem('players'))` 一致 |
| **URL 変化** | pathname / hash / query の変化 | 画面遷移系操作 |

#### 4.3.4 補助 assertion（任意・追加）

primary に加えて、以下を補助として含めることができる：
- 通知表示（showMsg / toast / alert）
- アニメーション完了
- その他の二次的変化

#### 4.3.5 重要な禁止事項（A-4.2 型悪用防止）

- **UI 重要操作（v1.2.5 §1.4）では、通知表示のみ を成功条件とすることを禁止**
- 例：保存ボタンで `expect(showMsg).toBeVisible()` だけを成功条件にし、実データが保存されていない、は不可

#### 4.3.6 画面遷移系操作の例外（v1.2.5 v2.2.1 整合）

- 画面遷移・タブ遷移が**業務目的そのもの**の場合（例：「ホーム画面に戻る」「設定画面を開く」）、URL 変化を primary として単独で許容する
- ただし**遷移先の主要 DOM 表示確認**を補助 assertion として推奨

#### 4.3.7 shogi 固有の primary assertion カタログ

| 操作 | primary semantic assertion |
|------|---------------------------|
| クラスボタン A | `expect(state.players[lastIndex].cls).toBe('A')` |
| クラスボタン B | `expect(state.players[lastIndex].cls).toBe('B')` |
| 削除ボタン | `expect(state.players.length).toBe(beforeLength - 1)` |
| 保存ボタン | `expect(JSON.parse(localStorage.getItem('players'))).toEqual(state.players)` |
| 過去参加者から追加 | `expect(state.players.length).toBe(beforeLength + 1)` + member_id 一致 |
| マスタ編集削除 | `expect(state.master.member.find(m => m.id === target).deleted).toBe(true)` |
| エクスポート | `expect(JSON.parse(clipboardText)).toMatchSchema(exportSchema)` |
| インポート（マージ） | `expect(state.master.member.length).toBe(beforeLength + newCount)` |

このカタログは Stage 2 着手時に refactor / 拡張する。
```

---

### D. §5 Stage 2 完了基準に追加

**現行 v1（§5、Stage 2）**：
```
Stage 2: expectClickable ヘルパ実装 + 既存テスト全置換（force click 撤廃）
```

**v1.2 で完了基準を以下に強化**：
```
Stage 2: expectClickable + clickAndExpectChange ヘルパ実装 + 既存テスト全置換
完了基準:
- ✅ expectClickable ヘルパが §4.2 の 7 段階検証すべて実装
- ✅ clickAndExpectChange ヘルパが §4.3 の primary semantic assertion 必須化を強制
- ✅ 既存 272 件の e2e click 全件が clickAndExpectChange に置換済み
- ✅ force: true の使用箇所がリポジトリ全体でゼロ（grep で検証）
- ✅ UI 重要操作（§1.4）の primary assertion がすべて宣言済み
- ✅ §4.3.7 の shogi 固有カタログが完備
- ✅ Codex レビュー A 以上
```

---

### E. §5 Stage 4 完了基準に追加

**現行 v1（§5、Stage 4）**：
```
Stage 4: A-4.2 A/B ボタン回帰テスト（既存実装で赤になることを確認）
```

**v1.2 で完了基準を以下に強化**：
```
Stage 4: A-4.2 A/B ボタン回帰テスト
完了基準:
- ✅ shogi クラスボタン A の primary assertion `state.players[lastIndex].cls === 'A'` で記述
- ✅ A-4.2 既存実装（commit 73961d3）で当該テストが**赤**になることを確認
- ✅ A-4.2.1 hotfix 適用後に**緑**になることを Stage 4 範囲外（次フェーズ）として記録
- ✅ 偽陽性が再混入しないことを Mutation Testing で検証
```

---

### F. §6 受け入れ基準に追加

**新規追加項目**：
```
- ✅ v1.2.5 §2.2 L4 完全整合（expectClickable 7 段階 + clickAndExpectChange primary assertion 必須化）
- ✅ A-4.2 回帰テストが primary semantic assertion ベースで赤
- ✅ §4.3.7 shogi 固有 primary assertion カタログが完備
```

---

### G. 改訂履歴

**追加行**：
```markdown
| v1.2 | 2026-05-06 00:45 | v1.2.5 §2.2 L4 確定（primary semantic assertion 必須化、5 点 hit-test、画面遷移系例外、Codex Yes YAML フォーマット）を反映。§4.3 として clickAndExpectChange ヘルパ仕様を新設。Stage 2 / Stage 4 / §6 受け入れ基準を更新 |
```

---

## 適用後の確認項目（Claude Code 用）

1. ファイル名: `docs/specs/20260506_0045_shogi_at_spec_v1_2.md` として新規配置
2. v1（`20260505_2046_shogi_at_spec_v1.md`）はそのまま残す（履歴）
3. ロードマップ更新：v17 として A-T spec v1.2 確定を記録
4. git commit: `docs(A-T): spec v1.2 (v1.2.5 §2.2 L4 反映)`
5. push: feat/phase-a-t-test-hardening ブランチへ
