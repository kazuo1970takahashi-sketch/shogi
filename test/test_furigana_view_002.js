#!/usr/bin/env node
// SHOGI-TOUR-FURIGANA-VIEW-002: player.yomi のルビ表示を「順位表 / 星取表 / 閲覧ビュー / 印刷・PDF」へ展開する単体テスト。
//   設計メモ: docs/notes/20260615_shogi_tour_furigana_mvp_design.md §A-5（後続スライス 2〜4）。
//   前提: FURIGANA-MVP-001(#210) で player.yomi 保持＋受付一覧 ruby は実装済み（test_furigana_mvp_001.js が担保）。
//   本テストの対象は「当日 player.yomi を当日 state 単体で各表示へ ruby 展開」する VIEW-002 の追加分のみ。
//
// 観点（タスク test 要件）:
//   H.  共通 helper: playerNameRubyHtml(string版) / yomiOf / nameWithNoRubyHtml の規則と XSS escape
//   S.  スマホ星取表/順位表（buildScoreboardClassTableHtml）: yomi 有→ruby / 無→氏名のみ / No.xx 維持 / 星・順位・勝敗数 退行なし
//   R.  通常の順位表/星取表（buildResults*Html）: 氏名 ruby / 勝敗表内の対戦相手名 ruby / 空は氏名のみ
//   P.  印刷・PDF（printResults / printPairings / downloadReport）: 生成 HTML に ruby と最低限の print CSS が含まれる
//   X.  空 <rt> を出さない / name・yomi の XSS escape が全経路で効く
//
// 対応しなかった画面（理由はテスト末尾と PR 完了報告に明記）:
//   - 対局管理（renderTournament）のペア表示・対局履歴・winner-btn は本タスク対象外（設計メモ §A-5 で別スライス、
//     ボタン内 ruby は折返し検討要）。本テストでも検証対象にしない。
//   - JS alert()/confirm() の氏名はプレーンテキストで ruby（HTML）を出せないため対象外。

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// 軽量 DOM mock（#210 test と同方針）。Blob は _content を捕捉して印刷 HTML を検証する。
function makeContext(){
  const blobs = [];
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      style:{}, _attrs:{}, childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      addEventListener:function(){}, removeEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
    };
  }
  var elements={};
  var docMock={
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(ev,cb){ if(ev==='load')cb(); },print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  function BlobMock(parts,opt){ var c=(parts&&parts[0])?String(parts[0]):''; var b={_isMockBlob:true,_content:c,type:opt&&opt.type}; blobs.push(b); return b; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock, _blobs:blobs };
}

function loadEnv(path){
  const ctx = makeContext();
  const js = extractScripts(path);
  const cryptoMock = {randomUUID(){return '00000000-0000-0000-0000-000000000000';}};
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       normalizeState:normalizeState,
       playerNameRubyHtml:playerNameRubyHtml,
       yomiOf:yomiOf,
       nameWithNoRubyHtml:nameWithNoRubyHtml,
       buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,
       buildResultsDesktopHtml:buildResultsDesktopHtml,
       buildResultsMobileHtml:buildResultsMobileHtml,
       buildResultsRoundCellDesktopHtml:buildResultsRoundCellDesktopHtml,
       buildResultsClassHtml:buildResultsClassHtml,
       calcFinal:calcFinal,
       getWins:getWins,
       getTopPlayers:getTopPlayers,
       printResults:printResults,
       printPairings:printPairings,
       downloadReport:downloadReport,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, {log(){},warn(){},error(){}}, Promise, function(cb){ /* no-op timer */ }
  );
  api._ctx = ctx;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_furigana_view_002.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// p1=山田/やまだ（勝者・ルビあり）, p2=佐藤/''（ルビなし）。1回戦 p1 勝ち。
function stateWithResults(){
  return {
    players:{A:[
      {id:'p1',name:'山田',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'やまだ'},
      {id:'p2',name:'佐藤',cls:'A',member:'member',grade:'ippan',entry_no:2,yomi:''}
    ],B:[]},
    rounds:1, pairings:{A:[],B:[]},
    results:{A:[[{p1:'p1',p2:'p2',winner:'p1'}]],B:[]}, started:true,
    classes:[{id:'A',name:'Aクラス',started:true},{id:'B',name:'Bクラス',started:true}],
    report:{date:'2026-05-18',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'架空将棋大会',organizer:'',fax:'',officeName:'',accountingNote:''}
  };
}
// 組み合わせ印刷用: 開始済 + 現ラウンドのペアあり + 結果未提出（results.length=0 < rounds=1）。
function stateWithPairings(){
  var s=stateWithResults();
  s.results={A:[],B:[]};
  s.pairings={A:[{p1:'p1',p2:'p2'}],B:[]};
  return s;
}
function lastBlob(env){ var b=env._ctx._blobs; return b.length?b[b.length-1]._content:''; }

// ============================================================
// H. 共通 helper
// ============================================================
{
  const env = loadEnv(targetPath);
  // playerNameRubyHtml（string 版）
  assert(env.playerNameRubyHtml('山田','やまだ')==='<ruby>山田<rt>やまだ</rt></ruby>',
    'H1-a yomi あり → <ruby>氏名<rt>よみ</rt></ruby>');
  assert(env.playerNameRubyHtml('佐藤','')==='佐藤',
    'H1-b yomi 空 → 氏名のみ（ruby を使わない）');
  assert(env.playerNameRubyHtml('佐藤','   ')==='佐藤',
    'H1-c 空白のみ yomi → trim 後空 → 氏名のみ');
  assert(env.playerNameRubyHtml('佐藤',null)==='佐藤',
    'H1-d null yomi → 氏名のみ');
  assert(env.playerNameRubyHtml('佐藤','').indexOf('<rt>')<0,
    'H1-e 空 yomi で空 <rt> を出さない');
  // XSS: name / yomi を escape
  const hx = env.playerNameRubyHtml('a<b&c"','x<y');
  assert(hx.indexOf('&lt;')>=0 && hx.indexOf('&amp;')>=0 && hx.indexOf('&quot;')>=0,
    'H2-a name の < & " が escape される');
  assert(hx.indexOf('<rt>x&lt;y</rt>')>=0,
    'H2-b yomi の < が escape されて <rt> に入る');
  assert(hx.indexOf('a<b')<0,
    'H2-c 生の "a<b" は出力されない（innerHTML 直挿しによる XSS を増やさない）');

  // yomiOf
  env._setState(stateWithResults());
  assert(env.yomiOf('p1','A')==='やまだ', 'H3-a yomiOf: 該当 player の yomi を返す');
  assert(env.yomiOf('p2','A')==='', 'H3-b yomiOf: yomi 空は ""');
  assert(env.yomiOf('nope','A')==='', 'H3-c yomiOf: 未登録 id は ""');

  // nameWithNoRubyHtml: 番号は素のまま・氏名のみルビ
  const nn1 = env.nameWithNoRubyHtml('p1','A');
  assert(nn1.indexOf('｜<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'H4-a "番号｜<ruby>氏名<rt>よみ</rt></ruby>"（番号は ruby の外）');
  assert(nn1.indexOf('<rt>')>=0 && nn1.match(/<rt>([^<]*)<\/rt>/)[1]==='やまだ',
    'H4-b <rt> の中身は よみ のみ（番号や ｜ を含まない）');
  const nn2 = env.nameWithNoRubyHtml('p2','A');
  assert(nn2.indexOf('<ruby>')<0 && nn2.indexOf('佐藤')>=0 && nn2.indexOf('｜')>=0,
    'H4-c yomi 空 → "番号｜氏名"（ruby なし・空 <rt> なし）');
}

// ============================================================
// S. スマホ星取表 / スマホ順位表（buildScoreboardClassTableHtml）= ?view=scoreboard 表示
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(stateWithResults());
  const html = env.buildScoreboardClassTableHtml('A');
  assert(html.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'S1 yomi ありの氏名がルビ表示される（スマホ星取表）');
  assert(html.indexOf('佐藤')>=0 && html.indexOf('<rt>佐藤')<0,
    'S2 yomi なしの氏名は従来どおり氏名のみ（ルビなし）');
  assert(html.indexOf('<rt></rt>')<0,
    'S3 空 <rt> を出さない');
  assert(html.indexOf('No.')>=0,
    'S4 No.xx の補助表示が維持される（退行なし）');
  assert(html.indexOf('○')>=0,
    'S5 星取（○）表示が維持される（退行なし）');
  assert(html.indexOf('sb-col-rank')>=0 && /<td class="sb-col-rank">\d+<\/td>/.test(html),
    'S6 順位列が維持される（退行なし）');
  assert(html.indexOf('sb-wins')>=0,
    'S7 勝敗数列が維持される（退行なし）');
  // XSS（スマホ星取表でも氏名 escape）
  const sx = stateWithResults();
  sx.players.A[0].name='<b>x</b>'; sx.players.A[0].yomi='';
  env._setState(sx);
  const hx = env.buildScoreboardClassTableHtml('A');
  assert(hx.indexOf('<b>x</b>')<0 && hx.indexOf('&lt;b&gt;')>=0,
    'S8 氏名の HTML は escape される（XSS 安全）');
}

// ============================================================
// R. 通常の順位表 / 星取表（buildResults*Html）
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(stateWithResults());
  const finals = env.calcFinal('A');
  const wins = env.getWins('A');

  // 順位表（PC）氏名にルビ
  const d = env.buildResultsDesktopHtml('A', finals, wins);
  assert(d.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'R1-a 順位表(PC)の氏名にルビ');
  assert(d.indexOf('佐藤')>=0 && d.indexOf('<rt>佐藤')<0,
    'R1-b 順位表(PC)で yomi 空は氏名のみ');
  assert(d.indexOf('<rt></rt>')<0, 'R1-c 空 <rt> を出さない（PC順位表）');

  // 順位表（スマホ）氏名にルビ
  const mo = env.buildResultsMobileHtml('A', finals, wins);
  assert(mo.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'R2 順位表(スマホカード)の氏名にルビ');

  // 勝敗表（星取）内の対戦相手名にルビ: p2 の 1回戦相手 = p1(やまだ)
  const cell = env.buildResultsRoundCellDesktopHtml('A','p2',0,wins);
  assert(cell.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'R3-a 勝敗表(星取)の対戦相手名にルビ');
  // p1 の 1回戦相手 = p2(yomi空) → 相手名は氏名のみ
  const cell2 = env.buildResultsRoundCellDesktopHtml('A','p1',0,wins);
  assert(cell2.indexOf('佐藤')>=0 && cell2.indexOf('<rt>')<0,
    'R3-b 対戦相手の yomi 空は氏名のみ（空 <rt> なし）');

  // No.xx（getNameWithNo 経由）維持 + 勝敗マーク維持（退行なし）
  assert(d.indexOf('｜')>=0, 'R4-a 順位表の番号｜氏名 表記が維持される（退行なし）');
  assert(d.indexOf('○')>=0 || cell.indexOf('○')>=0 || d.indexOf('●')>=0,
    'R4-b 勝敗マークが維持される（退行なし）');
}

// ============================================================
// P. 印刷・PDF（生成 HTML に ruby と print CSS が含まれる）
// ============================================================
{
  // P1. printResults（対戦成績 = 順位表/星取表の印刷）
  const env = loadEnv(targetPath);
  env._setState(stateWithResults());
  env.printResults();
  const h = lastBlob(env);
  assert(h.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'P1-a printResults: 氏名（順位列）にルビが含まれる');
  assert(h.indexOf('rt{')>=0 && h.indexOf('ruby{ruby-position:over}')>=0,
    'P1-b printResults: <rt> が潰れない print CSS が含まれる');
  assert(h.indexOf('佐藤')>=0 && h.indexOf('<rt></rt>')<0,
    'P1-c printResults: yomi 空は氏名のみ・空 <rt> なし');
}
{
  // P2. printPairings（組み合わせ印刷）
  const env = loadEnv(targetPath);
  env._setState(stateWithPairings());
  env.printPairings();
  const h = lastBlob(env);
  assert(h.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'P2-a printPairings: 組み合わせカードの氏名にルビが含まれる');
  assert(h.indexOf('.card-player ruby')>=0,
    'P2-b printPairings: カード氏名の print ルビ CSS が含まれる');
  assert(h.indexOf('佐藤')>=0,
    'P2-c printPairings: yomi 空の対戦者も氏名表示される');
  // TABLE-NO-REMOVE-001 (#941 / Codex 1巡目 P2): 卓番バッジ（absolute の .card-no）と、
  //   ★**そのバッジを避けるためだけに置かれていた余白**を両方外したことを見る。
  //   バッジだけ消して余白を残すと、カード1枚ごとに 22px の空白が残り、
  //   人数が多い回で紙が1ページ増える（Codex が指摘するまで消し忘れていた）。
  assert(h.indexOf('card-no')<0,
    'P2-d printPairings: 卓番バッジ（.card-no）は出力にも CSS にも残っていない');
  assert(h.indexOf('margin-top:22px')<0,
    'P2-e printPairings: バッジ避けの margin-top:22px を残していない');
  assert(/\.card\{[^}]*\}/.test(h) && !/\.card\{[^}]*position:relative/.test(h),
    'P2-f printPairings: .card の position:relative（absolute の基準）も残っていない');
  assert(/\.card-body\{[^}]*display:flex/.test(h),
    'P2-g printPairings: .card-body 自体は従来どおり（消したのは余白だけ）');
}
{
  // P3. downloadReport（報告書 = 最終結果/入賞者）
  const env = loadEnv(targetPath);
  env._setState(stateWithResults());
  env.downloadReport();
  const h = lastBlob(env);
  assert(h.indexOf('<ruby>山田<rt>やまだ</rt></ruby>')>=0,
    'P3-a downloadReport: 入賞者（最終結果）氏名にルビが含まれる');
  assert(h.indexOf('rt{')>=0 && h.indexOf('ruby{ruby-position:over}')>=0,
    'P3-b downloadReport: <rt> が潰れない print CSS が含まれる');
  // getTopPlayers が yomi を持つ（ルビ描画の素データ）
  const top = env.getTopPlayers('A');
  assert(top.length>=1 && top[0].name==='山田' && top[0].yomi==='やまだ',
    'P3-c getTopPlayers が name と yomi を返す（rank/name 退行なし）');
}

// ============================================================
// X. 退行ガード: yomi 全空の state では ruby/<rt> を一切出さない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = stateWithResults();
  s.players.A[0].yomi=''; s.players.A[1].yomi='';
  env._setState(s);
  const sb = env.buildScoreboardClassTableHtml('A');
  const d = env.buildResultsDesktopHtml('A', env.calcFinal('A'), env.getWins('A'));
  assert(sb.indexOf('<ruby>')<0 && sb.indexOf('<rt>')<0,
    'X1 yomi 全空 → スマホ星取表に ruby/<rt> を一切出さない（従来表示と等価）');
  assert(d.indexOf('<ruby>')<0 && d.indexOf('<rt>')<0,
    'X2 yomi 全空 → 通常順位表に ruby/<rt> を一切出さない（従来表示と等価）');
  assert(sb.indexOf('山田')>=0 && sb.indexOf('佐藤')>=0,
    'X3 yomi 全空でも氏名は従来どおり表示される');
}

console.log('');
console.log('  SHOGI-TOUR-FURIGANA-VIEW-002 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
