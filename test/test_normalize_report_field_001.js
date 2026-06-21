#!/usr/bin/env node
// NORMALIZE-REPORT-FIELD-001 (Phase B-1 集約 / #285):
//   normalizeReport* 系 10 関数を 1 汎用関数 normalizeReportField(value, key) ＋ 設定テーブル
//   REPORT_FIELD_SPECS に集約したことに伴う、集約点の薄いユニットテスト。
//
//   目的:
//     - 汎用関数 normalizeReportField と 10 個の薄いラッパー（normalizeReportTitle 等）が、
//       各フィールドの既定値・trim・特殊処理（title 末尾「報告書」除去 / prize 数値 fallback）を
//       従来どおり返すことを固定する。
//     - 「ラッパー === normalizeReportField(value, key)」の委譲恒等性を全フィールドで確認する。
//   ※ build*/downloadReport 出力のバイト一致は test_golden_master_001.js が担保。本テストは
//     正規化ヘルパー単体の代表入力・エッジケース（prize の 0 / Infinity / 負数、非文字列 fallback 等）に絞る。
//
//   shogi_v4.html は一切変更しない（test/ のみ）。

const fs = require('fs');

const targetPath = process.argv[2] || 'shogi_v4.html';

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

// 最小 DOM / window / localStorage モック（既存 report テストと同型）。本テストは純ヘルパーのみ呼ぶ。
function makeContext(){
  function makeNode(){
    return { nodeType:1, id:'', className:'', value:'', innerHTML:'', style:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(){}, getAttribute:function(){ return null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode(); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(){ return makeNode(); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode(), addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout',
    `${js};
     return {
       normalizeReportField:normalizeReportField,
       normalizeReportTitle:normalizeReportTitle,
       normalizeReportOrganizer:normalizeReportOrganizer,
       normalizeReportFax:normalizeReportFax,
       normalizeReportOfficeName:normalizeReportOfficeName,
       normalizeReportAccountingNote:normalizeReportAccountingNote,
       normalizeReportPlace:normalizeReportPlace,
       normalizeReportSei:normalizeReportSei,
       normalizeReportFuku:normalizeReportFuku,
       normalizeReportNote:normalizeReportNote,
       normalizeReportPrize:normalizeReportPrize
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

var PASS=0, FAIL=0;
function assertEq(actual, expected, msg){
  var a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a===e){ PASS++; }
  else { FAIL++; console.log('  ✗ '+msg+'  (expected '+e+' / got '+a+')'); }
}

var env = loadEnv();

// ============================================================
// A. string フィールドの既定値（空文字 / 空白のみ / 非文字列 → def）
// ============================================================
var STRING_DEFAULTS = {
  title:'沼津支部月例将棋大会',
  organizer:'日本将棋連盟沼津支部',
  fax:'943-9443',
  officeName:'沼津支部事務局',
  accountingNote:'※役員会で会計長へ収支報告書として提出ください。',
  place:'労政会館',
  sei:'',
  fuku:'',
  note:''
};
Object.keys(STRING_DEFAULTS).forEach(function(key){
  var def = STRING_DEFAULTS[key];
  assertEq(env.normalizeReportField('', key), def, 'A '+key+': 空文字 → 既定値');
  assertEq(env.normalizeReportField('   ', key), def, 'A '+key+': 空白のみ → 既定値');
  assertEq(env.normalizeReportField('　', key), def, 'A '+key+': 全角空白のみ → 既定値');
  assertEq(env.normalizeReportField(null, key), def, 'A '+key+': null → 既定値');
  assertEq(env.normalizeReportField(undefined, key), def, 'A '+key+': undefined → 既定値');
  assertEq(env.normalizeReportField(123, key), def, 'A '+key+': 数値（非文字列） → 既定値');
  assertEq(env.normalizeReportField('  有効値  ', key), '有効値', 'A '+key+': 両端 trim');
});

// ============================================================
// B. title 専用: 末尾「報告書」除去（1 回・trailing 空白再 trim）
// ============================================================
assertEq(env.normalizeReportField('特別大会報告書','title'), '特別大会', 'B title: 末尾「報告書」を 1 回除去');
assertEq(env.normalizeReportField('特別大会','title'), '特別大会', 'B title: 「報告書」なしはそのまま');
assertEq(env.normalizeReportField('特別大会  報告書','title'), '特別大会', 'B title: 中間空白も除去後 trim');
assertEq(env.normalizeReportField('特別大会　報告書','title'), '特別大会', 'B title: 中間全角空白も除去後 trim');
assertEq(env.normalizeReportField('報告書','title'), '沼津支部月例将棋大会', 'B title: 「報告書」単体 → 既定値');
assertEq(env.normalizeReportField('  報告書  ','title'), '沼津支部月例将棋大会', 'B title: trim 後「報告書」単体 → 既定値');
assertEq(env.normalizeReportField('報','title'), '報', 'B title: 3 文字未満は除去対象外');
// 他フィールドは「報告書」除去をしない（stripSuffix なし）
assertEq(env.normalizeReportField('会場報告書','place'), '会場報告書', 'B place: stripSuffix なし → 「報告書」は残る');

// ============================================================
// C. prize 専用: 数値正規化（0 有効・負数/Infinity/NaN/非数値 → 7000）
// ============================================================
assertEq(env.normalizeReportField(0,'prize'), 0, 'C prize: 0 は有効値（falsy でも 7000 に戻さない）');
assertEq(env.normalizeReportField(5000,'prize'), 5000, 'C prize: 正の数はそのまま');
assertEq(env.normalizeReportField(-1,'prize'), 7000, 'C prize: 負数 → 7000');
assertEq(env.normalizeReportField(Infinity,'prize'), 7000, 'C prize: Infinity → 7000');
assertEq(env.normalizeReportField(NaN,'prize'), 7000, 'C prize: NaN → 7000');
assertEq(env.normalizeReportField('5000','prize'), 5000, 'C prize: 数値文字列 → 数値');
assertEq(env.normalizeReportField('  7000  ','prize'), 7000, 'C prize: 前後空白付き数値文字列 → 数値');
assertEq(env.normalizeReportField('0','prize'), 0, 'C prize: "0" → 0');
assertEq(env.normalizeReportField('','prize'), 7000, 'C prize: 空文字 → 7000');
assertEq(env.normalizeReportField('abc','prize'), 7000, 'C prize: 非数値文字列 → 7000');
assertEq(env.normalizeReportField('-3','prize'), 7000, 'C prize: 負数文字列 → 7000');
assertEq(env.normalizeReportField(null,'prize'), 7000, 'C prize: null → 7000');
assertEq(env.normalizeReportField(undefined,'prize'), 7000, 'C prize: undefined → 7000');

// ============================================================
// D. 委譲恒等性: 各ラッパー === normalizeReportField(value, key)
// ============================================================
var WRAPPERS = [
  ['normalizeReportTitle','title'], ['normalizeReportOrganizer','organizer'],
  ['normalizeReportFax','fax'], ['normalizeReportOfficeName','officeName'],
  ['normalizeReportAccountingNote','accountingNote'], ['normalizeReportPlace','place'],
  ['normalizeReportSei','sei'], ['normalizeReportFuku','fuku'], ['normalizeReportNote','note'],
  ['normalizeReportPrize','prize']
];
var SAMPLES = ['', '   ', '　', '  値  ', '報告書', '特別大会報告書', '0', '5000', 'abc', null, undefined, 123, 0, -1, NaN, Infinity];
WRAPPERS.forEach(function(pair){
  var name=pair[0], key=pair[1];
  SAMPLES.forEach(function(s, i){
    assertEq(env[name](s), env.normalizeReportField(s, key),
      'D '+name+' === normalizeReportField(..,"'+key+'") [sample#'+i+']');
  });
});

console.log('  normalizeReportField 集約 ユニットテスト: PASS '+PASS+'件 / FAIL '+FAIL+'件');
process.exit(FAIL===0 ? 0 : 1);
