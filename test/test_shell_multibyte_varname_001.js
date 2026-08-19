#!/usr/bin/env node
// SHELL-MB-VARNAME-001 — `$var` の直後の全角文字（bash 3.2 で変数名に食われる）を機械で禁じる
// =============================================================================
// なぜ要るか（2026-08-19 実測）:
//   作者機（macOS 既定の **bash 3.2**）は UTF-8 ロケールで **高位バイトを変数名に取り込む**。
//   そのため `say "検出 $_name（${_s2} bytes）"` のような行は、`_name` が代入済みでも
//   `set -u` の下で「`_name?`: 未割り当ての変数です」で落ちる。
//   **cloud / CI の bash 5 では再現しない**＝全量テストが緑のまま作者機だけが壊れる。
//
//   実害: `scripts/land.sh` 228 行で **#909 便2 の bundle 受け渡しが実際に止まった**。
//   規約は test_bulk_inline_error_pins_887.sh のヘッダに書いてあったが、
//   **守らせる機械が無かった**ので再発した。これがその機械。
//
// ★ なぜ Node で書くか（Codex P2 r3810168495 で作り直した）:
//   初版は `grep -P` に依存していた。**macOS の BSD grep に -P は無い**ので、
//   この不具合の対象である作者機では走査も自己検査もせず exit 0 する＝
//   「何も検査していない」が成功として扱われる。ヘッダには「perl 相当の代替へ落ちる」と
//   書いてあったが**その実装は無かった**（＝安い代理で本物の確認を置き換えた形）。
//   Node は全テストが既に依存していて、正規表現も引用状態の追跡も外部依存なしでできる。
//
// ★ 引用状態を実際に追う（Codex P2 r3810168484 / r3810168491）:
//   行頭 `#` を落とすだけの走査には穴が2つあった。
//     ・**展開されるヒアドキュメント**（`<<EOF`）の中の `# $var（` は本文であり展開される。
//       コメント扱いで捨てると**見逃す**
//     ・**単一引用符**・**引用付きヒアドキュメント**（`<<'EOF'`）・**行末のインラインコメント**は
//       展開されない。ここを違反にすると**誤検出**で、直すとリテラルの出力自体が変わる
//   そこで簡易トークナイザで NORMAL / 単一引用 / 二重引用 / ヒアドキュメント（展開する・しない）
//   を追い、**展開される文脈だけ**を対象にする。
//
// 使い方: node test/test_shell_multibyte_varname_001.js
// 終了コード: 0=違反なし / 1=違反あり
// 依存: node / git。network 不使用。
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

// 変数名は [A-Za-z_][A-Za-z0-9_]* だけを見る。`$1（` `$@（` のような特殊パラメータは
// 名前が1文字で確定するため後続バイトを食わない＝この不具合の対象外。
const HAZARD = /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/;

// 展開される文脈だけを残した「走査用の行」を返す簡易トークナイザ。
//   返り値は行ごとの文字列（展開されない部分は空白に置換して桁を保つ）。
function expandableParts(src) {
  const lines = src.split('\n');
  const out = new Array(lines.length).fill('');
  let sq = false;           // 単一引用（行をまたぐ）
  let dq = false;           // 二重引用（行をまたぐ）
  let heredoc = null;       // { term, expand, strip }
  let pending = [];         // この行の終わりから始まるヒアドキュメント

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    if (heredoc) {
      const probe = heredoc.strip ? line.replace(/^\t+/, '') : line;
      if (probe === heredoc.term) { heredoc = null; continue; }
      // 引用付きヒアドキュメントは展開されない。引用なしは **`#` 行も含めて**展開される。
      out[li] = heredoc.expand ? line : '';
      continue;
    }

    let buf = '';
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (sq) { buf += ' '; if (c === "'") sq = false; i++; continue; }
      if (dq) {
        if (c === '\\' && i + 1 < line.length) { buf += '  '; i += 2; continue; }
        if (c === '"') { dq = false; buf += ' '; i++; continue; }
        buf += c; i++; continue;                      // 二重引用の中は展開される
      }
      if (c === '\\' && i + 1 < line.length) { buf += '  '; i += 2; continue; }
      if (c === "'") { sq = true; buf += ' '; i++; continue; }
      if (c === '"') { dq = true; buf += ' '; i++; continue; }
      // コメント: 語の先頭に現れた `#` から行末まで（NORMAL のときだけ）
      if (c === '#' && (i === 0 || /[\s;&|(]/.test(line[i - 1]))) break;
      // ヒアドキュメントの開始
      if (c === '<' && line[i + 1] === '<') {
        const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\(\S+)|(\w+))/.exec(line.slice(i));
        if (m) {
          const quoted = m[2] !== undefined || m[3] !== undefined || m[4] !== undefined;
          const term = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
          pending.push({ term: term, expand: !quoted, strip: m[1] === '-' });
          buf += ' '.repeat(m[0].length);
          i += m[0].length;
          continue;
        }
      }
      buf += c; i++;
    }
    out[li] = buf;
    if (pending.length) { heredoc = pending.shift(); pending = []; }  // 1行1本だけ追う（実運用で十分）
  }
  return out;
}

function scan(src) {
  const parts = expandableParts(src);
  const hits = [];
  for (let i = 0; i < parts.length; i++) if (HAZARD.test(parts[i])) hits.push({ line: i + 1, text: parts[i].trim() });
  return hits;
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
let viol = 0;
for (const f of files) {
  const hits = scan(fs.readFileSync(path.join(REPO, f), 'utf8'));
  for (const h of hits) { viol++; ng(f + ':' + h.line + ': ' + h.text.slice(0, 120)); }
}
if (viol === 0) ok('追跡下の *.sh ' + files.length + ' 本に違反なし（$var の直後は必ず ASCII か ${var}）');

// ---- ② 検出装置そのものへの自己検査（毎回その場で当てる） -------------------
//   ★ Codex P2 の3件がそのまま試験項目になっている。
const FW = '（';   // 全角の開き括弧
const V = '$' + 'V';   // このファイル自身の中に `$V（` の並びを書かない（走査対象外だが紛らわしいため）
const CASES = [
  ['二重引用符の中は展開される＝違反',                   'V=1\necho "検出 ' + V + FW + 'bytes"', true],
  ['単一引用符の中は展開されない＝違反ではない',          "V=1\nprintf '%s' '" + V + FW + "'", false],
  ['行末のインラインコメントは展開されない＝違反ではない', 'V=1\necho hi   # ' + V + FW + '説明', false],
  ['行頭のコメントは違反ではない',                       '  # 説明: ' + V + FW + 'コメント', false],
  ['★展開されるヒアドキュメントの # 行も本文＝違反',      'V=1\ncat <<EOF\n# ' + V + FW + 'これは本文\nEOF', true],
  ['引用付きヒアドキュメントは展開されない＝違反ではない', "V=1\ncat <<'EOF'\n# " + V + FW + 'これは本文\nEOF', false],
  ['${var} と囲めば違反ではない',                        'V=1\necho "検出 ${V}' + FW + 'bytes"', false],
  ['$var の直後が ASCII なら違反ではない',                'V=1\necho "検出 ' + V + ' bytes"', false],
  ['エスケープした $ は展開されない＝違反ではない',        'echo "\\' + V + FW + 'bytes"', false],
];
for (const [label, src, want] of CASES) {
  const got = scan(src).length > 0;
  assert(got === want, '自己検査: ' + label + (got === want ? '' : '  [期待 ' + want + ' / 実際 ' + got + ']'));
}

// ★ 実際に起きた形をそのまま1本置く（land.sh 228 行の再現）。
assert(scan('_name=x\nsay "検出 $_name' + FW + '${_s2} bytes' + '）"').length === 1,
  '自己検査: land.sh 228 行の形（受け渡しを止めた実物）を検出できる');

console.log('\n  SHELL-MB-VARNAME-001: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
