# テスト読込の共通ヘルパ移行レシピ [PHASE1-LOADER-001 / PHASE1-ISOLATE-001]

対象:

- `test/lib/app_harness.js` … **全束評価**の共通ヘルパ（`loadApp`・スライス2）。§1〜§4
- `test/lib/app_isolated.js` … **隔離実行**の共通ヘルパ（`loadIsolated`・スライス3）。§6〜§7

スライス2は **意味論を一切変えない共通化だけ**を扱った。挙動が変わりうる移行（隔離実行）は
スライス3（§6・実装済み）で、「**現状の検出力を1件も悪化させない・向上は記録する**」を基準に行った。

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

## 5. 残り本数の census（`3838f61` → スライス2 後 `d325d38` → スライス3 適用後）

`test/test_*.js` = 181 本 → 182 本（`test_app_harness_001.js`）→ **183 本**（`test_app_isolated_001.js`）。

| 方式 | 3838f61 | d325d38 | スライス3 後 | 内訳 |
|---|---:|---:|---:|---|
| 自前 `new Function`（未移行の全束評価） | 143 | 135 | **135** | 次スライス以降の候補 |
| `loadApp`（全束評価の共通ヘルパ） | 0 | 9 | **10** | セルフテスト1＋スライス2の8＋`test_cloud_history_scoreboard_765`（本スライスで追加） |
| `loadIsolated`（隔離実行の共通ヘルパ） | 0 | 0 | **7** | セルフテスト1＋移行6本 |
| grep のみ（読込なし） | 31 | 31 | **31** | ソース文字列検査だけ・対象外 |
| 合計 | 174 | 175 | **183** | ＋セルフテスト2本（181→183） |

自前 `extractFn` を定義していたテストは **7 本 → 0 本**（参照実装として持つのは
セルフテスト `test_app_isolated_001.js` の 1 本のみ。これは意図的＝§6 の byte 一致検査に使う）。
移行 7 本の `extractFn` 呼出サイトは **50 箇所**（定義行を除く実使用。うち 6 本は
`extractFn(RAW, name)` のソース検査として残置、`test_class_variable_002` は 0＝全部 `loadIsolated` へ）。

`function extractScripts` を自前定義しているテストは **107 本（3838f61）→ 104 本（d325d38）→ 103 本**
（減りが移行本数と一致しないのは、旧テストの複製が `scripts()` など別名の場合があるため）。

**第16便（`test/lib/reachability.js` / `test/reachability_allowlist.json` /
`test/test_reachability_001.js`）との重なりは 0 件。** 本スライスが触るのは
移行 7 本＋`test/lib/app_isolated.js`＋`test/lib/prelude_census.js`＋`test/lib/MIGRATION.md`＋
`test/lib/mutation_runner.js`＋`test/test_app_isolated_001.js`。

---

## 6. 隔離モード `loadIsolated`（スライス3・実装済み）

### 前提: extractFn の隔離は欠陥ではなく検出装置

`extractFn` 系 7 本は「対象関数のソースだけを切り出し、`state` も他のアプリ関数も無い空環境で評価」
していた。この性質は**故障検出装置**である。

- 対象関数が `state` 依存や新しい関数依存を獲得すると、隔離環境では `ReferenceError` で即 FAIL する
- 実証: `bulkAddPlayers` に `saveData();` を注入すると、隔離版は ReferenceError で FAIL するが、
  全束評価版は PASS のまま実マスタ書込みまで通ってしまう
- Phase 2 の目的（ペアリング3関数の `state` 依存**除去**）にとってこの検出力が最重要。
  全束評価へ寄せると**アサーション不変のまま**この検出力だけが消える（＝空洞化）

したがって 7 本は「共通化ついでに全束評価へ寄せる」ことをしない。**隔離という性質を保存したまま**
共通化するのが `test/lib/app_isolated.js` の `loadIsolated`。

### 実測でわかっていた「現行の隔離」の穴（v2 で確定した前提）

移行前の隔離は `new Function` 実装のため **Node の `globalThis` が透過**していた。

- `if(typeof saveData==='function')saveData();`（このコードベースの家風イディオム）は
  移行前も**検出されない**（`typeof` ガードなので ReferenceError にならない）
- `crypto.randomUUID()` の注入も移行前は**検出されない**（Node のグローバル `crypto` を掴む）

→ 本スライスの基準は「**現状の検出力を1件も悪化させない。可能な向上は記録する**」。
`vm` の最小コンテキストは後者（Node グローバル依存）を**新たに検出する**方向の差になる。

### 設計の要点

1. **評価機構は `vm` の最小コンテキスト**（`new Function` ではない）。見えるのは JS 言語標準
   （`Object`/`Array`/`JSON`/`Math`/`Date`/`Promise`/`RegExp` …）と `prelude` で明示した名前だけ。
   `vm` が既定で注入する `console` は明示的に `delete` する（`NODE_INJECTED_GLOBALS`）。
   `process`/`Buffer`/`setTimeout`/`crypto`/`fetch`/`require` はそもそも入らない（Node 20 実測）。
2. **既定で `state` を置かない**。`prelude` は「名前→値」のオブジェクト形で、per-file で明示的に渡す。
3. **不足依存を全束から自動補完しない**。補完すると検出力が消える（B-iso3 が実証）。
4. **bare 参照は実際に `throw` させる**。スコープ Proxy で「undefined を返して `missing` に記録するだけ」に
   すると空洞化する（B-iso5 が実証）。`iso.missing` は throw の**付随記録**にすぎない。
5. `prelude` の名前が切り出し対象と衝突したら例外（`loadApp` の clobber ガードと同じ考え方）。
6. **束は束のまま移行する**。`PURE_NAMES` 等の隔離束を単関数に分割しない（相互呼出しが密で、
   分割すると即 ReferenceError＝実測）。
7. 切り出し器は旧 `extractFn` と **byte 一致**。セルフテストが参照実装を持ち、対象関数**全件**
   （現状 66 件）で毎回検査する。

### 落とし穴

- **レルムをまたぐ `instanceof` は効かない。** vm 側で生まれた例外は
  `e instanceof ReferenceError` が false になる（`e.constructor.name` で見ること）。
  `Array.isArray` は内部スロットを見るのでレルムをまたいでも真。
- **`state` を引数で受ける関数に bare `state` を注入しても検出できない。**
  `applyParticipantSwapFromMaster(p,memberId,master,state)` のように仮引数が `state` の関数では、
  注入した `state` は仮引数を指す。依存獲得の変異は**仮引数に無い純ヘルパ**へ入れること。
- **`typeof X==='function'` ガード形の依存は隔離でも検出できない**（既知の限界・REQ3 が pin）。

---

## 7. 移行レシピ（隔離モード）

### 置き換え対応表

| 移行前 | 移行後 |
|---|---|
| 各ファイルの `function extractFn(name){…}` | `const {extractFn} = require('./lib/app_isolated')`（引数は `extractFn(RAW, name)`） |
| `fs.readFileSync(process.argv[2]‖'shogi_v4.html')` | `readHtml()`（`app_isolated` から再輸出） |
| `new Function(srcs.join('\n') + ';return {a:a,b:b}')()` | `loadIsolated([...names]).api()` |
| `new Function('var state=null;' + srcs + …)` | `loadIsolated([...names], {prelude:{state:null}})` |
| `new Function('return (' + src + ')')()` | `loadIsolated([name]).fn(name)` |
| 評価文字列に埋め込んだ stub 定義 | `prelude` の「名前→値」 |
| 評価文字列に埋め込んだ実行シナリオ | 文字列の外の通常コード（下記の規約） |

### シナリオ埋込 harness の規約

`bulk` F2/G1・`master_sync` D7/D8・`guest` G/D/W のように「評価文字列の中に stub 定義＋実行シナリオが
埋め込まれ、読込と不可分」だった節は:

- **シナリオ部（stub 定義・実行手順）は文字列の外の通常コードへ書き直してよい**
- **アサーション（`ok(...)`/`assert(...)` の検査式・期待値・ラベル）は1文字も変えない**
- 書き直しの等価性はその節のクラスA変異で担保する（`mutation_runner.js`）

### 環境グローバルへの正当な依存が出たとき

対象関数が `crypto` や `console` に**正当に**依存している場合は、`prelude` に明示追加し、
**追加した名前と理由を RESULT の表に残す**（意図的な線引きとして記録する）。
機械的な突き合わせは `node test/lib/prelude_census.js` で再現できる。

本スライスでの追加は 2 件のみ（31 名中）:

| ファイル | 名前 | 理由 |
|---|---|---|
| `test_class_variable_002` | `crypto` | `generateMemberId` の `typeof crypto==='undefined'` ガード。旧 `new Function` は Node の `crypto` を掴んでいた |
| `test_guest_tournament_001` | `console` | `syncBranchMasterOnSave` の outer catch が `console.warn` を呼ぶ。旧実装はホスト側 `console.warn` を差し替えて凌いでいた |

### 変異検証

```bash
node test/lib/mutation_runner.js              # スライス2＋スライス3の全表
node test/lib/mutation_runner.js --only CV    # 1本目（test_class_variable_002）だけ
node test/lib/mutation_runner.js --only B-iso # 検出装置への攻撃だけ
```

- **クラスA**: アサーション群ごとの代表変異。方向を `dir` で宣言する
  （`same`＝新旧一致すべき／`improve`＝新側でのみ検出＝検出力向上／`known-limit`＝新旧とも未検出）。
- **クラスB**: `app_isolated.js` そのものへの攻撃。`combo` を持つものは
  「harness 変異 × アプリ変異」を組み合わせて、**出荷形では検出される故障が変異版では素通りする**
  ことまで示す（＝その設計判断が効いている証拠）。
- runner 自身が「常に一致」を返す形に壊れたら、表を1行も出す前に `selfCheck()` が exit 2 で落ちる。

### 進め方の順序（実施済み）

1. `loadIsolated` を作り、**1 本目 = `test_class_variable_002`** だけ移行して変異表で検出力一致を確認（ゲート）
2. 残り 5 本を同手順で移行。`test_cloud_history_scoreboard_765` は隔離実行ゼロなので
   全束部分のみ `loadApp` へ（スライス2 方式）
3. その後に Phase 2（ペアリング3関数の `state` 依存除去）へ進む
