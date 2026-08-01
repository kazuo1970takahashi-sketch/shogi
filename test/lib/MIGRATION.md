# テスト読込の共通ヘルパ移行レシピ [PHASE1-LOADER-001]

対象: `test/lib/app_harness.js`（全束評価の共通ヘルパ）。
このスライスは **意味論を一切変えない共通化だけ**を扱う。挙動が変わる種類の移行（隔離実行）は
スライス3へ送る（§5）。

---

## 1. なにが集約されたか

移行前、各テストは以下を自前で複製していた。

```js
const RAW = fs.readFileSync(process.argv[2] || 'shogi_v4.html', 'utf8');
function scripts(){ const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m,o=''; while((m=re.exec(RAW))!==null)o+=m[1]+'\n'; return o; }
function node(){ return {nodeType:1,id:'',style:{}, /* …DOM mock を各自で書く… */ }; }
const fn = new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
  scripts() + ';return {foo:foo, bar:bar};');
const env = fn(doc, win, ls, /* … */);
```

移行後:

```js
const {loadApp, readHtml} = require('./lib/app_harness');
const RAW = readHtml();            // 静的アサート用の生ソース（評価しない）
const app = loadApp();             // 全束評価（既定 mock 込み）
app.ctx.foo(...)                   // トップレベル関数はすべて ctx に出る（return 句は不要）
```

読む束は**同じ**。`assertExtractionMatchesLegacy()` が「既存テストの素の正規表現との byte 一致」を
返し、セルフテスト `test/test_app_harness_001.js` の A1 がそれを固定している。

---

## 2. 置き換え対応表

| 移行前 | 移行後 |
|---|---|
| `fs.readFileSync(process.argv[2]‖'shogi_v4.html')` | `readHtml()`（引数省略時 `process.argv[2]` を見る） |
| `scripts()` / `extractScripts(RAW)` の自前複製 | 不要（ヘルパ内部） |
| `new Function(...names, js+';return {a:a,b:b}')` | `loadApp()` |
| `env.a(...)` | `app.ctx.a(...)`（`const env = loadApp().ctx` にすれば呼び出し側は無改造） |
| `_setState(s)` / `_set(v)` 相当 | `app.ctx.state = s`（`app.state` でも可） |
| `_get()` 相当 | `app.ctx.state` |
| `_doc` 相当 | `app.document` / `app.el(id)` |
| 自前 `els` レジストリ | `app.els`（`document.getElementById` が遅延生成した要素の索引） |
| `BACKUP_KIND` 等の定数の `return` 句 | `app.ctx.BACKUP_KIND`（**トップレベル `var` に限る** → §4） |

### mock は二相のどちらに割り当てるか

| 差し替えたいもの | 相 | 書き方 |
|---|---|---|
| `document` / `window` / `localStorage` / `sessionStorage` / `location` / `navigator` / `crypto` / `alert` / `confirm` / `prompt` / `console` / `setTimeout` / `setInterval` / `fetch` / `Blob` / `FileReader` / `URL` | **評価前 override**（ブラウザ API） | `loadApp({overrides:{localStorage: myLs}})` |
| `loadBranchMaster` / `saveData` / `showMsg` / `normalizeCity` … **アプリ自身が定義する関数** | **評価後 stub** | `const restore = app.stub('showMsg', fn)` |
| 上記アプリ関数の「呼ばれ方」だけ見たい | 評価後 spy | `const log = app.spy('showMsg')`（既定で本物を通す） |

**アプリが定義する名前を `overrides` に渡すと `loadApp` が例外になる。**
評価時に本物の定義で黙って上書きされ、stub のつもりが無効化されている事故
（テストは緑のまま実マスタへ書き込む）を機械的に潰すため。例外文言が該当名と
「評価後 stub を使え」を示すので、そのまま `app.stub(...)` に移せばよい。

`Promise` / `Math` / `Date` / `JSON` は vm のレルムが持っているので注入していない。
差し替えたい場合だけ `overrides` に渡す（アプリは定義していないので clobber ガードには当たらない）。

### 既定 mock（各自複製の上位集合）

- `document`: `getElementById` は id ごとに遅延生成してキャッシュ（既存テストと同じ流儀）。
  `createElement` / `createTextNode` / `createDocumentFragment` / `body` / `head` / `documentElement` /
  `addEventListener` / `querySelector(All)` を持つ。ノードは `style`(`display:''` 初期値) / `classList` /
  `dataset` / `_attrs` / `childNodes` / `onclick` / `click()` / `appendChild` / `insertBefore` /
  `removeChild` / `remove` / `setAttribute` / `getAttribute` / `focus` などを持つ。
- `localStorage` / `sessionStorage`: **実体のあるインメモリ store**（書いた値が読み戻る）。
  `record.localSetItem` / `record.localRemoveItem` に記録される。
- `setTimeout` / `setInterval`: **発火しない**（既存テストの `cb=>0` と同じ）。`record.timers` に積まれ、
  明示的に流したいときだけ `app.flushTimers()`。
- `crypto.randomUUID()` は定数 `'0'`（既存テスト最多数派）。id の一意性が要るテストは `overrides` で差し替える。
- `alert` / `confirm`(→`true`) / `prompt`(→`''`) / `console` は記録つきの無音実装。

### 副作用の記録（`app.record`）

`localSetItem` / `localRemoveItem` / `sessionSetItem` / `sessionRemoveItem` / `alert` / `confirm` /
`prompt` / `console` / `fetch` / `timers` / `intervals` / `createElement` / `fileReads` / `calls`。
アプリ関数の呼び出し記録は `app.spy(name)` → `app.calls(name)`。

---

## 3. 節ごと fresh `loadApp` の原則

**テストが節ごとに環境を作り直しているなら、移行後も節ごとに `loadApp` し直す。**
1 つの ctx を使い回すと、

- `stub` / `spy` が次の節へ漏れて、次の節が本物ではなく前節の差し替えを検査する
- `localStorage` の中身・`record` の配列・`document` の要素レジストリが持ち越され、
  「要素が存在すること」の検査が前節の残骸で**恒真化**する

評価コストは実測 **7〜20ms / 回**（684 グローバル・580 関数を公開）なので、節ごとに作り直して問題ない。
セルフテストの E5〜E8 がこの独立性を固定している。

移行例（`test_storage_warn_001.js`）: `localStorage` の種類が節ごとに違うので、節ごとに
`loadApp({overrides:{localStorage: ls}})` する。

---

## 4. 落とし穴

1. **トップレベル `const` / `let` は ctx に出ない。** `new Function` では関数スコープの束縛なので
   `return` 句から拾えていたが、`vm` ではスクリプトのレキシカルスコープに入り、グローバルオブジェクト
   （＝ctx）のプロパティにならない。現状の `shogi_v4.html` はトップレベル `const/let` **0 件**で、
   セルフテスト C7 がそれを pin している。落ちたらこの節に戻ること（対処: アプリ側を `var` にするか、
   ヘルパに「末尾に `globalThis.X = X;` を追記する」口を足す）。
2. **`src=` 付き `<script>` は除外**する。現対象では inline 2 本のみで旧実装と byte 一致（A1）。
   将来 `src=` 付きに中身が書かれた場合だけ差が出る（ブラウザも無視する側なので除外が正しい）。
3. **`readHtml()` / `loadApp()` の既定対象は `process.argv[2]`**。`run_tests.sh` は
   `node test/test_X.js "$TARGET"` で起動する。`NO_TARGET_TESTS` の 2 本は引数無しなので、
   移行するなら対象を明示すること。
4. **ソースはプロセス内でキャッシュ**される（同じ絶対パスなら再読込しない）。変異注入は
   プロセスを分けて別パスに対して行うこと（`test/lib/mutation_runner.js` がそうしている）。

---

## 5. 残り本数の census（`3838f61` 実測 → 本 PR 適用後）

`test/test_*.js` = 181 本 → 182 本（`test_app_harness_001.js` を追加）。

| 方式 | 3838f61 | 本 PR 後 | 内訳 |
|---|---:|---:|---|
| 全束評価のみ | 143 | 143（うち **8 本が共通ヘルパ済み**） | 下表 |
| `extractFn` 併用 | 7 | 7（**未着手＝スライス3**） | `test_bulk_entry_001` / `test_class_variable_002` / `test_cloud_history_scoreboard_765` / `test_guest_tournament_001` / `test_master_sync_clarity_001` / `test_player_swap_001` / `test_player_swap_002` |
| grep のみ（読込なし） | 31 | 31（**対象外**） | ソース文字列検査だけ |
| 共通ヘルパのセルフテスト | 0 | 1 | `test_app_harness_001.js` |

全束評価 143 本の内訳（本 PR 後）:

| 区分 | 本数 | 移行の難易 |
|---|---:|---|
| 共通ヘルパ移行済み | **8** | 完了 |
| 標準 mock・`shogi_v4.html` 系（次の候補） | **100** | 低（本 PR と同じ手順） |
| 濃い mock（supabase client 注入・`new Proxy` 等） | **17** | 中（既定 mock に足すか `overrides` で渡すか要判断） |
| `app/*.js` 系（対象 HTML を引数で受けない別系統） | **16** | 対象外に近い（読む対象が違う） |
| `NO_TARGET_TESTS`（`test_a4_class_canon` / `test_growth_award`） | **2** | 対象外 |

**第16便（`test/lib/reachability.js` / `test/reachability_allowlist.json` / `test/test_reachability_001.js`）
との重なりは 0 件**（本 PR が触るのは上記 8 本＋`test/lib/app_harness.js`＋`test/lib/MIGRATION.md`＋
`test/lib/mutation_runner.js`＋`test/test_app_harness_001.js`）。`test/lib/` の新設が両ブランチで
起きても git 上は競合しない。

---

## 6. スライス3の設計案: 隔離モード `loadIsolated`

### 前提: extractFn の隔離は欠陥ではなく検出装置

`extractFn` 系 7 本は「対象関数のソースだけを切り出し、`state` も他のアプリ関数も無い空環境で評価」
している。この性質は**故障検出装置**である。

- 対象関数が `state` 依存や新しい関数依存を獲得すると、隔離環境では `ReferenceError` で即 FAIL する
- 実証: `bulkAddPlayers` に `saveData();` を注入すると、旧テストは ReferenceError で FAIL するが、
  全束評価版は 42/42 PASS のまま実マスタ書込みまで通ってしまう
- Phase 2 の目的（ペアリング3関数の state 依存**除去**）にとってこの検出力が最重要。
  全束評価へ寄せると**アサーション不変のまま**この検出力だけが消える（＝空洞化）

したがって 7 本は「共通化ついでに全束評価へ寄せる」ことをしない。移行するなら、
**隔離という性質を保存したまま**共通化する API が要る。

### API 案

```js
const iso = loadIsolated(['bulkAddPlayers', 'normalizeYomi'], {
  prelude: { escapeHtml: (s) => String(s) },  // 意図的に与える依存だけを明示的に置く
  target: 'shogi_v4.html',
});
iso.fn('bulkAddPlayers')(...)
iso.missing   // 評価/実行中に ReferenceError になった名前（＝獲得された依存）の記録
```

要件:

1. **既定で空環境**。`state` を置かない。`prelude` に明示した名前だけが見える。
   「全束から必要な関数を自動で引っ張ってくる」は**やってはいけない**（検出力が消える）。
2. 関数の切り出しは現行 7 本の `extractFn`（`function NAME(` から対応する `}` まで）と
   **同じ切り出し結果になること**を、移行時に byte 比較で確認する。
3. `ReferenceError` は握り潰さず、そのままテストへ伝播させる。ただし
   **どの名前で落ちたか**を `iso.missing` に記録して、失敗メッセージを読みやすくする。
4. `prelude` に渡した名前が切り出し対象自身と衝突したら例外（`loadApp` の clobber ガードと同じ考え方）。
5. 移行の受け入れは本スライスと同じく **2 クラスの変異表**で行う。特にクラスBとして
   「`state` を隔離環境に置いてしまう」変異を入れ、`bulkAddPlayers` へ `saveData();` を注入する
   クラスA変異が**検出されなくなること**（＝空洞化する）を示し、それが起きない設計であることを固定する。

### 進め方の順序

1. まず `loadIsolated` を作り、7 本のうち **1 本**だけ移行して変異表で検出力一致を示す
2. 残り 6 本は同じ手順で追随
3. その後に Phase 2（ペアリング3関数の state 依存除去）へ進む
