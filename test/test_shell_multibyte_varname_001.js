#!/usr/bin/env node
// SHELL-MB-VARNAME-001 — `$var` の直後の全角文字（bash 3.2 で変数名に食われる）を機械で禁じる
// =============================================================================
// なぜ要るか（2026-08-19 実測）:
//   作者機（macOS 既定の **bash 3.2**）は UTF-8 ロケールで **高位バイトを変数名に取り込む**。
//   `say "検出 $_name（${_s2} bytes）"` は `_name` が代入済みでも `set -u` の下で
//   「`_name?`: 未割り当ての変数です」で落ちる。**cloud / CI の bash 5 では再現しない**＝
//   全量テストが緑のまま作者機だけが壊れる。`scripts/land.sh` 228 行で
//   **#909 便2 の bundle 受け渡しが実際に止まった**。
//   規約は test_bulk_inline_error_pins_887.sh のヘッダに書いてあったが、
//   **守らせる機械が無かった**ので再発した。これがその機械。
//
// =============================================================================
// ★ 設計: **シェルを解析しない。** 生の並びだけを見て、例外は行に明示させる。
// =============================================================================
//   初版は bash+awk+grep -P、2版目は Node の簡易トークナイザ（引用・ヒアドキュメントを追う）
//   だった。Codex が2巡で **10 件**の穴を出した: 多重ヒアドキュメント（`cat <<A <<B`）／
//   `$((1 << 2))` をヒアドキュメント開始と誤認／`<<E'OF'` のような混在引用の区切り語／
//   ヒアドキュメント本文の `\$`／`$(...)` の入れ子引用／`$'...'` の `\'`／
//   バックスラッシュ改行後の `#`／`x)# ...` の `#`。**どれも当たっている。**
//
//   そこで方針を変えた。**この検査に必要なのはシェルの意味論ではない。**
//     ・見逃し（false negative）＝作者機だけが壊れ、CI は緑。**気づけない**
//     ・過検出（false positive）＝赤くなって目に入る。**気づける**
//   非対称なので、**見逃しゼロを構造で保証する**側に倒す:
//
//     1. `$name` の直後が非 ASCII なら、**文脈を問わず**違反にする（解析なし＝壊れる余地なし）
//     2. 展開されない場所（単一引用符の中など）で本当に必要なら、その行に
//        **`mb-ok: <理由>` を書いて明示的に免除する**（人が1行ぶん責任を取る）
//     3. 免除した行数は**必ず表示する**（黙って落とさない）
//
//   2026-08-19 時点で追跡下の *.sh 30 本に対し、免除が要る行は **1 行だけ**
//   （この不具合そのものを説明しているコメント）。過検出のコストは実測でこの程度。
//
//   ★ この方針は「網羅的な正しさ」を捨てている。`printf '%s' '$var（'` のような
//     **展開されないリテラルも赤くなる**。それは仕様であって不具合ではない。
//     直し方は `${var}` に変える（展開される文脈では出力が変わらない）か、
//     リテラルを変えたくないなら `mb-ok:` を書く。
//
// 使い方: node test/test_shell_multibyte_varname_001.js
// 終了コード: 0=違反なし / 1=違反あり
// 依存: node / git。network 不使用。外部コマンド（grep -P / awk / perl）に依存しない
//       ＝**作者機で「何も検査せず成功」になる分岐が存在しない**（Codex P2 r3810168495）。
// =============================================================================
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m) => { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); };
const ng = (m) => { fail++; console.error('  ✗ ' + m); };
const assert = (c, m) => (c ? ok(m) : ng(m));

// 変数名は [A-Za-z_][A-Za-z0-9_]* のみ。`$1（` `$@（` のような特殊パラメータは
// 名前が1文字で確定するため後続バイトを食わない＝この不具合の対象外。
const HAZARD = /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/;
// 免除マーカー。**理由を書かないと免除にならない**（黙って無効化させない）。
const EXEMPT = /mb-ok:\s*\S/;

function scan(src) {
  const hits = [];
  let exempted = 0;
  src.split('\n').forEach((line, i) => {
    if (!HAZARD.test(line)) return;
    if (EXEMPT.test(line)) { exempted++; return; }
    hits.push({ line: i + 1, text: line.trim() });
  });
  return { hits: hits, exempted: exempted };
}

console.log('\n【SHELL-MB-VARNAME-001】$var の直後の全角文字（bash 3.2 で変数名に食われる）');

// ---- ① 追跡下の *.sh を全部走査 -------------------------------------------
let files = [];
try {
  files = execSync("git ls-files '*.sh'", { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (e) { files = []; }
if (files.length === 0) {
  console.error('  ✗ 検査対象の *.sh が 0 件（git 管理下で実行していない）＝緑と「何も検査していない」を区別できない');
  process.exit(1);
}
let viol = 0, exempted = 0;
const exemptLines = [];
for (const f of files) {
  const r = scan(fs.readFileSync(path.join(REPO, f), 'utf8'));
  for (const h of r.hits) { viol++; ng(f + ':' + h.line + ': ' + h.text.slice(0, 120)); }
  if (r.exempted) { exempted += r.exempted; exemptLines.push(f + ' ×' + r.exempted); }
}
if (viol === 0) ok('追跡下の *.sh ' + files.length + ' 本に違反なし（$var の直後は必ず ASCII か ${var}）');
// ★ 免除は黙って落とさない。件数と場所を毎回出す（silent cap を作らない）。
console.log('  ・免除（mb-ok: 付き）: ' + exempted + ' 行' + (exemptLines.length ? '  [' + exemptLines.join(' / ') + ']' : ''));

// ---- ② 検出装置そのものへの自己検査（毎回その場で当てる） -------------------
const FW = '（';          // 全角の開き括弧
const V = '$' + 'V';       // このファイル自身に `$V（` の並びを書かない
const CASES = [
  ['二重引用符の中は違反',                         'V=1\necho "検出 ' + V + FW + 'bytes"', true],
  ['★単一引用符の中も違反にする（過検出は仕様）',   "V=1\nprintf '%s' '" + V + FW + "'", true],
  ['★コメントの中も違反にする（解析しない）',       '  # 説明: ' + V + FW + 'コメント', true],
  ['★ヒアドキュメント本文も違反にする',             'V=1\ncat <<EOF\n# ' + V + FW + '本文\nEOF', true],
  ['mb-ok: と理由があれば免除',                     "printf '%s' '" + V + FW + "'   # mb-ok: 展開されないリテラル", false],
  ['mb-ok: に理由が無ければ免除しない',             "printf '%s' '" + V + FW + "'   # mb-ok:", true],
  ['${var} と囲めば違反ではない',                   'V=1\necho "検出 ${V}' + FW + 'bytes"', false],
  ['$var の直後が ASCII なら違反ではない',           'V=1\necho "検出 ' + V + ' bytes"', false],
  ['特殊パラメータは対象外（$1 は1文字で確定）',      'echo "検出 $1' + FW + 'bytes"', false],
];
for (const [label, src, want] of CASES) {
  const got = scan(src).hits.length > 0;
  assert(got === want, '自己検査: ' + label + (got === want ? '' : '  [期待 ' + want + ' / 実際 ' + got + ']'));
}
// 免除の計上そのものも見る（黙って捨てていない証拠）。
const exr = scan("printf '%s' '" + V + FW + "'   # mb-ok: 理由");
assert(exr.hits.length === 0 && exr.exempted === 1, '自己検査: 免除した行は件数として数える（黙って落とさない）');
// ★ 実際に起きた形をそのまま1本（land.sh 228 行の再現）。
assert(scan('_name=x\nsay "検出 $_name' + FW + '${_s2} bytes' + '）"').hits.length === 1,
  '自己検査: land.sh 228 行の形（受け渡しを止めた実物）を検出できる');

console.log('\n  SHELL-MB-VARNAME-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
