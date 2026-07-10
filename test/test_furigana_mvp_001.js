#!/usr/bin/env node
// SHOGI-TOUR-FURIGANA-MVP-001: 参加者ふりがな（player.yomi）最小実装の単体テスト。
//   設計メモ: docs/notes/20260615_shogi_tour_furigana_mvp_design.md（PR #209 で merge 済み）。
//   本実装の対象は「当日 state に player.yomi を保持」＋「受付一覧のみ ruby 表示」。
//   スコープ外（順位表/PDF/星取表/マスタ一覧列/検索/identity 移行/kanaSnapshot 改名）は検証しない。
//
// 観点:
//   A. normalizeState: 既存 player に yomi 無し → yomi:'' 補完 / 既存 yomi は保持 / 非文字列は ''
//   B. addPlayer: inp-yomi の値が player.yomi に保存 / 空は '' / カタカナは normalizeYomi で吸収 /
//      空 + サジェスト選択時は master.yomi をフォールバック
//   C. addPlayerFromMaster: master.yomi を player.yomi に snapshot / master.yomi 空なら ''
//   D. renderPlayerNameWithRuby(helper): yomi あり→<ruby>氏名<rt>よみ</rt></ruby> / 空→氏名のみ(空<rt>なし) /
//      name・yomi の HTML escape
//   E. makePlayerRow(受付一覧の行): yomi あり→ルビ / yomi 空→氏名のみ / 編集・削除ボタン保持(退行なし) / name escape

const fs = require('fs');

function extractScripts(path){
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

// ---- 軽量 DOM mock（createElement / createTextNode / appendChild を実体として保持し、
//      生成ノードツリーを serialize して ruby 構造と escape を検証できるようにする）----
function makeContext(){
  function makeText(t){ return {nodeType:3, textContent:String(t==null?'':t)}; }
  function gatherText(node){
    if(node==null)return '';
    if(node.nodeType===3)return node.textContent;
    var s='', ch=node.childNodes||[];
    for(var i=0;i<ch.length;i++)s+=gatherText(ch[i]);
    return s;
  }
  function makeNode(tag){
    return {
      nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'',
      type:'', selected:false, checked:false, disabled:false, hidden:false,
      style:{}, _attrs:{}, _innerHTML:'', childNodes:[],
      appendChild:function(c){ this.childNodes.push(c); return c; },
      insertBefore:function(c){ this.childNodes.unshift(c); return c; },
      removeChild:function(c){ var i=this.childNodes.indexOf(c); if(i>=0)this.childNodes.splice(i,1); return c; },
      remove:function(){},
      addEventListener:function(){}, removeEventListener:function(){},
      setAttribute:function(k,v){ this._attrs[k]=String(v); },
      getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
      removeAttribute:function(k){ delete this._attrs[k]; },
      focus:function(){}, blur:function(){}, click:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; },
      get firstChild(){ return this.childNodes[0]||null; },
      get lastChild(){ return this.childNodes[this.childNodes.length-1]||null; },
      get children(){ return this.childNodes.filter(function(n){return n.nodeType===1;}); },
      get textContent(){ return gatherText(this); },
      set textContent(v){ this.childNodes=[makeText(v)]; },
      get innerHTML(){ return this._innerHTML; },
      set innerHTML(v){ this._innerHTML=String(v); if(v==='')this.childNodes=[]; }
    };
  }
  var elements={};
  var docMock={
    _elements:elements,
    getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); },
    createTextNode:function(t){ return makeText(t); },
    body:makeNode('body'),
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }
  };
  var winMock={ innerWidth:1024, addEventListener:function(){}, removeEventListener:function(){},
    open:function(){ return {focus:function(){},addEventListener:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; },
    setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  function BlobMock(parts,opt){ return {_isMockBlob:true, _content:(parts&&parts[0])?String(parts[0]):'', type:opt&&opt.type}; }
  var urlMock={ createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){} };
  return { document:docMock, window:winMock, localStorage:localStorageMock, Blob:BlobMock, URL:urlMock };
}

// ノードツリー → HTML 文字列（text ノードは escape して連結＝ブラウザの textContent 描画相当）
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function serialize(node){
  if(node==null)return '';
  if(node.nodeType===3)return esc(node.textContent);
  var tag=String(node.tagName||'').toLowerCase(), inner='', ch=node.childNodes||[];
  for(var i=0;i<ch.length;i++)inner+=serialize(ch[i]);
  return '<'+tag+'>'+inner+'</'+tag+'>';
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
       addPlayer:addPlayer,
       addPlayerFromMaster:addPlayerFromMaster,
       makePlayerRow:makePlayerRow,
       renderPlayerNameWithRuby:renderPlayerNameWithRuby,
       normalizeYomi:normalizeYomi,
       normalizePersonName:normalizePersonName,
       saveBranchMaster:saveBranchMaster,
       _setState:function(s){state=s;},
       _getState:function(){return state;},
       _setSuggest:function(id,norm){_suggestState.selectedMemberId=id;_suggestState.selectedNormalizedName=norm;}
     };`
  );
  const api = fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){return true;}, function(){return '';},
    function(){}, ctx.Blob, ctx.URL, {log(){},warn(){},error(){}}, Promise, function(){}
  );
  api._ctx = ctx;
  return api;
}

const targetPath = process.argv[2];
if(!targetPath){console.error('Usage: node test_furigana_mvp_001.js <html>');process.exit(1);}

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(msg);else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeEmptyState(){
  return {
    players:{A:[],B:[]}, rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]}, started:false,
    classes:[{id:'A',name:'Aクラス',started:false},{id:'B',name:'Bクラス',started:false}],
    report:{date:'',place:'労政会館',start:'',end:'',sei:'',fuku:'',note:'',prize:7000,title:'架空将棋大会',organizer:'',fax:'',officeName:'',accountingNote:''}
  };
}
function rowState(player){ const s=makeEmptyState(); s.players.A=[player]; return s; }

// ============================================================
// A. normalizeState: yomi の既定補完 / 保持 / 防御
// ============================================================
{
  const env = loadEnv(targetPath);
  const raw = {
    players:{A:[{id:'p1',name:'架空太郎',member:'member',grade:'ippan',entry_no:1}],B:[]},
    rounds:4, pairings:{A:[],B:[]}, results:{A:[],B:[]},
    classes:[{id:'A',name:'Aクラス'},{id:'B',name:'Bクラス'}]
  };
  const ns = env.normalizeState(raw);
  assertEq(ns.players.A[0].yomi, '', 'A1-a 既存保存データ（yomi 不在）→ yomi:"" 補完');
  assertEq(ns.players.A[0].name, '架空太郎', 'A1-b name 保持（退行なし）');
  assertEq(ns.players.A[0].entry_no, 1, 'A1-c entry_no 保持（退行なし）');
  assertEq(ns.players.A[0].member, 'member', 'A1-d member 保持（退行なし）');

  const ns2 = env.normalizeState({players:{A:[{id:'p2',name:'架空花子',yomi:'かくうはなこ'}],B:[]},classes:[{id:'A'},{id:'B'}]});
  assertEq(ns2.players.A[0].yomi, 'かくうはなこ', 'A2 既存 player.yomi は保持される');

  const ns3 = env.normalizeState({players:{A:[{id:'p3',name:'架空',yomi:123}],B:[]},classes:[{id:'A'},{id:'B'}]});
  assertEq(ns3.players.A[0].yomi, '', 'A3 非文字列 yomi → ""（防御・型ガード）');
}

// ============================================================
// B. addPlayer: 受付ふりがな欄 → player.yomi
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());
  env._ctx.document.getElementById('inp-name').value = '架空太郎';
  env._ctx.document.getElementById('inp-class').value = 'A';
  env._ctx.document.getElementById('inp-yomi').value = 'かくうたろう';
  env.addPlayer();
  const a = env._getState().players.A;
  assertEq(a.length, 1, 'B1-a addPlayer で1名追加（退行なし）');
  assertEq(a[0].yomi, 'かくうたろう', 'B1-b inp-yomi の値が player.yomi に保存される');
  assertEq(a[0].name, '架空太郎', 'B1-c name も保存（退行なし）');
}
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());
  env._ctx.document.getElementById('inp-name').value = '架空次郎';
  env._ctx.document.getElementById('inp-class').value = 'A';
  env._ctx.document.getElementById('inp-yomi').value = '';
  env.addPlayer();
  assertEq(env._getState().players.A[0].yomi, '', 'B2 inp-yomi 空 → player.yomi は ""（未入力許容）');
}
{
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());
  env._ctx.document.getElementById('inp-name').value = '架空三郎';
  env._ctx.document.getElementById('inp-class').value = 'A';
  env._ctx.document.getElementById('inp-yomi').value = 'ヤマダ';
  env.addPlayer();
  assertEq(env._getState().players.A[0].yomi, 'やまだ', 'B3 カタカナ入力は normalizeYomi でひらがな化して保存');
}
{
  // 空 inp-yomi + サジェスト選択 → master.yomi フォールバック
  const env = loadEnv(targetPath);
  env._setState(makeEmptyState());
  env.saveBranchMaster({schema_version:1,updated_at:'',members:[{id:'m1',name:'架空花子',yomi:'かくうはなこ',member:'member',grade:'ippan'}]});
  env._setSuggest('m1', env.normalizePersonName('架空花子'));
  env._ctx.document.getElementById('inp-name').value = '架空花子';
  env._ctx.document.getElementById('inp-class').value = 'B';
  env._ctx.document.getElementById('inp-yomi').value = '';
  env.addPlayer();
  const b = env._getState().players.B;
  assertEq(b.length, 1, 'B4-a サジェスト経路でも1名追加');
  assertEq(b[0].yomi, 'かくうはなこ', 'B4-b inp-yomi 空 + サジェスト選択 → master.yomi をフォールバック保存');
  assertEq(b[0].member_id, 'm1', 'B4-c member_id 引き継ぎ（退行なし）');
}

// ============================================================
// C. addPlayerFromMaster: master.yomi → player.yomi snapshot（純粋関数）
// ============================================================
{
  const env = loadEnv(targetPath);
  const res = env.addPlayerFromMaster('m1','A',
    {schema_version:1,members:[{id:'m1',name:'架空次郎',yomi:'かくうじろう',member:'member',grade:'ippan'}]},
    makeEmptyState());
  assert(res && res.success, 'C-a addPlayerFromMaster 成功');
  assertEq(res.player.yomi, 'かくうじろう', 'C-b master.yomi が player.yomi に snapshot される');
  assertEq(res.player.member_id, 'm1', 'C-c member_id も付与（退行なし）');

  const res2 = env.addPlayerFromMaster('m2','A',
    {schema_version:1,members:[{id:'m2',name:'架空三郎',yomi:'',member:'member',grade:'ippan'}]},
    makeEmptyState());
  assertEq(res2.player.yomi, '', 'C-d master.yomi が空なら player.yomi は ""');

  // PAST-ADD-FEE-INHERIT-001: 単発追加でも master の grade='josei'（女性）を ippan に潰さず保持する。
  //   chu/ippan/other は従来挙動の byte 同値（純抽出）なので C-a..C-d は不変。josei のみ新たに保持。
  const resJosei = env.addPlayerFromMaster('mj','A',
    {schema_version:1,members:[{id:'mj',name:'架空女子',yomi:'かくうじょし',member:'member',grade:'josei'}]},
    makeEmptyState());
  assertEq(resJosei.player.grade, 'josei', 'C-e master.grade=josei は player.grade に保持（女性会費区分）');
}

// ============================================================
// D. renderPlayerNameWithRuby（共通 helper）
// ============================================================
{
  const env = loadEnv(targetPath);
  const n1 = env.renderPlayerNameWithRuby('山田','やまだ');
  assertEq(n1.nodeType, 1, 'D1-a yomi あり → element ノード');
  assertEq(String(n1.tagName).toLowerCase(), 'ruby', 'D1-b ruby 要素を返す');
  const h1 = serialize(n1);
  assert(h1.indexOf('<ruby>')>=0 && h1.indexOf('<rt>やまだ</rt>')>=0 && h1.indexOf('山田')>=0,
    'D1-c <ruby>山田<rt>やまだ</rt></ruby> 相当の構造');

  const n2 = env.renderPlayerNameWithRuby('佐藤','');
  assertEq(n2.nodeType, 3, 'D2-a yomi 空 → text ノード（ruby を使わない）');
  const h2 = serialize(n2);
  assert(h2.indexOf('<ruby>')<0 && h2.indexOf('<rt>')<0, 'D2-b 空 yomi はルビ無し（空 <rt> を出さない）');
  assertEq(h2, '佐藤', 'D2-c 氏名のみ表示');

  const h3 = serialize(env.renderPlayerNameWithRuby('a<b&c','x<y'));
  assert(h3.indexOf('&lt;')>=0 && h3.indexOf('&amp;')>=0, 'D3-a name/yomi の < & が escape される');
  assert(h3.indexOf('a<b')<0, 'D3-b 生の "a<b" はそのまま出力されない（XSS 安全）');

  assertEq(env.renderPlayerNameWithRuby('名','   ').nodeType, 3, 'D4-a 空白のみ yomi → trim 後空 → text ノード');
  assert(serialize(env.renderPlayerNameWithRuby('名','   ')).indexOf('<rt>')<0, 'D4-b 空白 yomi で空 <rt> を出さない');
  assert(serialize(env.renderPlayerNameWithRuby('名',null)).indexOf('<rt>')<0, 'D4-c null yomi で空 <rt> を出さない');
}

// ============================================================
// E. makePlayerRow（受付一覧の行 = renderRegList が 1 名ごとに生成）
// ============================================================
{
  const env = loadEnv(targetPath);
  env._setState(rowState({id:'p1',name:'山田',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'やまだ'}));
  const h1 = serialize(env.makePlayerRow(env._getState().players.A[0],'A',0));
  assert(h1.indexOf('<ruby>')>=0 && h1.indexOf('<rt>やまだ</rt>')>=0, 'E1 yomi あり → 行にルビ表示');

  env._setState(rowState({id:'p2',name:'佐藤',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''}));
  const h2 = serialize(env.makePlayerRow(env._getState().players.A[0],'A',0));
  assert(h2.indexOf('佐藤')>=0, 'E2-a yomi 空 → 氏名表示');
  assert(h2.indexOf('<ruby>')<0 && h2.indexOf('<rt>')<0, 'E2-b yomi 空 → ルビ無し（空 <rt> なし）');

  env._setState(rowState({id:'p3',name:'鈴木',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:'すずき'}));
  const h3 = serialize(env.makePlayerRow(env._getState().players.A[0],'A',0));
  // REG-TAB-TIDY-001 (#743) ⑤b: 行の「名前編集/削除」は「⋯ 編集」1ボタン＋シート（openPlayerEditSheet）へ集約。
  //   意図（編集・削除の導線が退行しない）は、行の集約ボタン＋シート内項目の静的存在で検証する。
  assert(h3.indexOf('⋯ 編集')>=0, 'E3-a 行に「⋯ 編集」集約ボタンが保持される（退行なし）');
  const rawHtml = fs.readFileSync(process.argv[2], 'utf8');
  assert(rawHtml.indexOf('✏️ 名前を編集')>=0 && rawHtml.indexOf('受付を取り消す（一覧から削除）')>=0, 'E3-b 編集シートに名前編集・削除項目が保持される');

  env._setState(rowState({id:'p4',name:'<script>x</script>',cls:'A',member:'member',grade:'ippan',entry_no:1,yomi:''}));
  const h4 = serialize(env.makePlayerRow(env._getState().players.A[0],'A',0));
  assert(h4.indexOf('<script>')<0, 'E4-a 行に生の <script> が出力されない（XSS 安全）');
  assert(h4.indexOf('&lt;script&gt;')>=0, 'E4-b 氏名の < > は escape される');
}

console.log('');
console.log('  SHOGI-TOUR-FURIGANA-MVP-001 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
