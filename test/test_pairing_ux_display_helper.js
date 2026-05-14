#!/usr/bin/env node
// PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT (PR #101 §10.1)
// formatParticipantLabel(player, options) の振る舞いを検証する。
// 対象: compact / standard モードのみ（detail / print は IMPL-LIGHT 対象外）。
// 確認観点（11):
//   1. 構造: shogi_v4.html に formatParticipantLabel が 1 件定義されている
//   2. compact:                          'A-12 山田太郎'
//   3. compact + record:                 'A-12 山田太郎（2勝0敗）'
//   4. standard:                         'A-12 山田太郎'
//   5. standard + category(member):      'A-12 山田太郎（沼津支部員）'
//   6. standard + category(other):       'A-12 山田太郎（他）'
//   7. standard + record:                'A-12 山田太郎（2勝0敗）'
//   8. standard + category + record:     'A-12 山田太郎（沼津支部員 / 2勝0敗）'
//   9. category 未設定（member 不明）時に extras に変な undefined / null が混じらない
//  10. compact では includeCategory:true を渡しても category は出ない（compact は仕様外）
//  11. 既存 helper（getName / getNameWithNo）が削除・破壊されていない
// その他:
//   - 戻り値は HTML escape 前のプレーン文字列（callsite で escapeHtml() を通す前提）
//   - 支部名フィールド前提になっていないこと（player.branch を参照しない）
//   - warning object / evaluatePairingQuality() に依存しないこと

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_ux_display_helper.js <html>');
  process.exit(1);
}

const htmlSrc = fs.readFileSync(targetPath, 'utf8');
const js = extractScripts(targetPath);

let pass = 0, fail = 0;
function ok(msg){ pass++; console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond, msg){ if(cond) ok(msg); else ng(msg); }

// ============================================================
// 1) 構造: formatParticipantLabel が 1 回だけ定義されている
// ============================================================
{
  const defMatches = htmlSrc.match(/function formatParticipantLabel\s*\(/g);
  const count = defMatches ? defMatches.length : 0;
  assert(count === 1, 'formatParticipantLabel が 1 回定義されている (count='+count+')');

  // 既存 helper が削除されていない
  assert(/function getName\s*\(\s*id\s*,\s*cls\s*\)/.test(htmlSrc), '既存 getName(id, cls) が維持されている');
  assert(/function getNameWithNo\s*\(\s*id\s*,\s*cls\s*\)/.test(htmlSrc), '既存 getNameWithNo(id, cls) が維持されている');

  // 支部名フィールド前提になっていないこと（player.branch を参照しない）
  // formatParticipantLabel の定義ブロック近傍に player.branch が出ないことを確認
  const idx = htmlSrc.indexOf('function formatParticipantLabel');
  const block = htmlSrc.substring(idx, idx + 2000);
  assert(block.indexOf('player.branch') < 0, 'formatParticipantLabel が player.branch を参照していない');
  assert(block.indexOf('沼津支部員') >= 0, 'formatParticipantLabel に「沼津支部員」表記が含まれる（category 用）');
}

// ============================================================
// 2-10) 振る舞いテスト: helper を sandbox で呼び出して出力を検証
// ============================================================

function loadHelper(){
  // shogi_v4.html の <script> 全体を Function 化して helper を取り出す。
  // helper は state や DOM に依存しないため、最小限の mock で足りる。
  const docMock = {
    getElementById(){ return null; },
    createElement(){ return { style:{}, addEventListener(){}, appendChild(){}, setAttribute(){} }; },
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){},
    querySelectorAll(){ return []; }
  };
  const winMock = { innerWidth: 1024 };
  const localStorageMock = { getItem(){ return null; }, setItem(){}, removeItem(){} };
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document', 'window', 'localStorage', 'alert', 'confirm', 'prompt',
    'FileReader', 'Blob', 'URL', 'crypto', 'console',
    `${js}
     return formatParticipantLabel;`
  );
  return fn(
    docMock, winMock, localStorageMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){}, { createObjectURL(){ return ''; }, revokeObjectURL(){} },
    cryptoMock, { log(){}, warn(){}, error(){} }
  );
}

const formatParticipantLabel = loadHelper();
assert(typeof formatParticipantLabel === 'function', 'formatParticipantLabel が関数として取り出せる');

const playerMember = { id:'p1', name:'山田太郎', cls:'A', entry_no:12, member:'member' };
const playerOther  = { id:'p2', name:'鈴木一郎', cls:'A', entry_no:3,  member:'other' };
const playerNoCat  = { id:'p3', name:'佐藤二郎', cls:'B', entry_no:7 }; // member 未設定

// 2. compact
assert(
  formatParticipantLabel(playerMember, { mode:'compact' }) === 'A-12 山田太郎',
  'compact 基本表示は "A-12 山田太郎"'
);

// 3. compact + record
assert(
  formatParticipantLabel(playerMember, { mode:'compact', includeRecord:true, record:{ wins:2, losses:0 } }) === 'A-12 山田太郎（2勝0敗）',
  'compact + record は "A-12 山田太郎（2勝0敗）"'
);

// 4. standard
assert(
  formatParticipantLabel(playerMember, { mode:'standard' }) === 'A-12 山田太郎',
  'standard 基本表示は "A-12 山田太郎"'
);

// 5. standard + category(member)
assert(
  formatParticipantLabel(playerMember, { mode:'standard', includeCategory:true }) === 'A-12 山田太郎（沼津支部員）',
  'standard + category(member) は "A-12 山田太郎（沼津支部員）"'
);

// 6. standard + category(other)
assert(
  formatParticipantLabel(playerOther, { mode:'standard', includeCategory:true }) === 'A-03 鈴木一郎（他）',
  'standard + category(other) は "A-03 鈴木一郎（他）"'
);

// 7. standard + record
assert(
  formatParticipantLabel(playerMember, { mode:'standard', includeRecord:true, record:{ wins:2, losses:0 } }) === 'A-12 山田太郎（2勝0敗）',
  'standard + record は "A-12 山田太郎（2勝0敗）"'
);

// 8. standard + category + record
assert(
  formatParticipantLabel(playerMember, { mode:'standard', includeCategory:true, includeRecord:true, record:{ wins:2, losses:0 } }) === 'A-12 山田太郎（沼津支部員 / 2勝0敗）',
  'standard + category + record は "A-12 山田太郎（沼津支部員 / 2勝0敗）"'
);

// 9. category 未設定（member 不明）でも extras に undefined / null が混じらない
{
  const out = formatParticipantLabel(playerNoCat, { mode:'standard', includeCategory:true });
  assert(out === 'B-07 佐藤二郎', 'category 未設定時は extras を追加せず "B-07 佐藤二郎"（undefined / null が混入しない）');
  assert(out.indexOf('undefined') < 0 && out.indexOf('null') < 0, '出力に "undefined" / "null" 文字列が含まれない');
}

// 10. compact では includeCategory:true を渡しても category は出ない（compact 仕様）
assert(
  formatParticipantLabel(playerMember, { mode:'compact', includeCategory:true }) === 'A-12 山田太郎',
  'compact では includeCategory:true でも category は出ない (compact 仕様、design check §4.1)'
);

// 11. record の wins/losses が未指定 / 型不正なら record block を出さない
{
  const out1 = formatParticipantLabel(playerMember, { mode:'standard', includeRecord:true });
  assert(out1 === 'A-12 山田太郎', 'record オブジェクト未指定なら record block を出さない');

  const out2 = formatParticipantLabel(playerMember, { mode:'standard', includeRecord:true, record:{ wins:'2', losses:0 } });
  assert(out2 === 'A-12 山田太郎', 'record.wins が型不正なら record block を出さない');
}

// 12. 不正な player でも throw せず空文字を返す（堅牢性）
{
  assert(formatParticipantLabel(null) === '', 'player が null なら空文字を返す');
  assert(formatParticipantLabel(undefined) === '', 'player が undefined なら空文字を返す');
  assert(formatParticipantLabel('not-an-object') === '', 'player が string なら空文字を返す');
}

// 13. entry_no 未設定なら "--" にフォールバックし、クラス文字は前置される
{
  const playerNoEntry = { id:'p4', name:'高橋三郎', cls:'A' };
  assert(formatParticipantLabel(playerNoEntry, { mode:'compact' }) === 'A--- 高橋三郎', 'entry_no 未設定時は "A---" にフォールバック');
}

// 14. mode 省略時は compact 扱い（既定値の安全側）
assert(
  formatParticipantLabel(playerMember, {}) === 'A-12 山田太郎',
  'mode 省略時は compact 扱い（既定値の安全側）'
);

// ============================================================
// 結果サマリ
// ============================================================
console.log('');
console.log('  PAIRING-UX-DISPLAY-HELPER-IMPL-LIGHT テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail === 0 ? 0 : 1);
