#!/usr/bin/env node
// @suite: NUMAZU-BEHAVIOR-001（#840）沼津固有の「挙動」2箇所を外す
// NUMAZU-BEHAVIOR-001（Issue #840・作者決定 2026-08-11 / 反証パネル1巡目で方針改訂）
//   ① 大会名に「月例」が入っていたら表示だけ無条件で沼津の名前に置換する挙動を撤去
//   ② 個人情報の同意文が「沼津支部内の大会運営目的で」と言い切っている問題を解消
//
//   ★★ このテストは1巡目で**全面的に書き直した**。1巡目の版は、固定入力しか見ていなかったため
//     「テストに出てくる名前だけ素通しする allowlist」や「25件の対応表を持つだけで正規化を
//     一切しない実装」で **全249テストが緑になった**（反証パネルAが実演）。
//     今回は入力集合に依存しない**性質**で検査する:
//       - 大量にランダム生成した「月例を含む名前」**すべて**で、生名がそのまま返ること（A2）
//       - 触った関数の**ソースに沼津リテラルが無い**こと（F）＝一本化の維持を形で守る
//       - `shogi_v4.html` と `app/auth.js` の2実装が**同じ答えを返す**こと（G）
//         ＝これまで両者の一致を守る番人が1つも無かった（パネルCの指摘）
//
//   入力は完全架空。shogi_v4.html / app/auth.js は読むだけ。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_numazu_behavior_840.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);
const RAW = fs.readFileSync(ABS,'utf8');
const AUTH_PATH = path.join(__dirname,'..','app','auth.js');

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }
function eq(actual, expected, msg){ assert(actual===expected, msg+'（期待「'+expected+'」実際「'+actual+'」）'); }

function makeNode(tag){
  return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'', textContent:'',
    style:{cssText:''}, _attrs:{}, childNodes:[], disabled:false,
    appendChild:function(c){ this.childNodes.push(c); return c; },
    removeChild:function(c){ return c; },
    setAttribute:function(k,v){ this._attrs[k]=String(v); },
    getAttribute:function(k){ return (k in this._attrs)?this._attrs[k]:null; },
    addEventListener:function(){}, removeEventListener:function(){},
    querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
}
function loadEnv(){
  const scripts=[]; const re=/<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while((m=re.exec(RAW))!==null)scripts.push(m[1]);
  var elements={};
  const doc={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:makeNode, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  const win={ innerWidth:1024, addEventListener:function(){}, open:function(){ return null; } };
  const ls={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  const fn = new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${scripts.join('\n')};
     return { canonicalizeCloudTournamentName:canonicalizeCloudTournamentName,
              buildCloudTournamentDisplayTitle:buildCloudTournamentDisplayTitle,
              defaultCloudTournamentTitle:defaultCloudTournamentTitle,
              buildMasterConsentPurposeText:buildMasterConsentPurposeText,
              normalizeReportTitle:normalizeReportTitle,
              factoryReport:factoryReport, CLUB_PROFILE_KEY:CLUB_PROFILE_KEY,
              localStorage:localStorage, state:state };`);
  return fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});
}
// app/auth.js 側の同名関数を取り出す（ShogiAuth の public export）
function loadAuth(){
  if(!fs.existsSync(AUTH_PATH))return null;
  const src=fs.readFileSync(AUTH_PATH,'utf8');
  // 既存 test_cloud_tourney_naming_app_608.js と同じ読み込み方（window に生やす形）
  try{
    var win={ document:{ addEventListener:function(){}, getElementById:function(){ return null; },
        querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } },
      localStorage:{ getItem:function(){ return null; }, setItem:function(){}, removeItem:function(){} },
      addEventListener:function(){}, location:{href:'', search:'', hash:''} };
    new Function('window',src)(win);
    var A=win.ShogiAuth;
    return (A&&typeof A.canonicalizeCloudTournamentName==='function')?A:null;
  }catch(e){ return null; }
}

const env = loadEnv();
const C = env.canonicalizeCloudTournamentName;

// 触った関数のソース本体を取り出す（一本化の検査用）
function fnSource(name){
  const i=RAW.indexOf('function '+name+'(');
  if(i<0)return '';
  let depth=0, started=false;
  for(let j=i;j<RAW.length;j++){
    const ch=RAW[j];
    if(ch==='{'){depth++;started=true;}
    else if(ch==='}'){depth--; if(started&&depth===0)return RAW.slice(i,j+1);}
  }
  return '';
}

console.log('\n[A1] 受け入れ基準1: 実例で、他クラブの大会名がそのまま返る');
(function(){
  eq(C('松本支部月例将棋大会'), '松本支部月例将棋大会', 'A1-1 松本支部月例将棋大会');
  eq(C('〇〇将棋クラブ月例会'), '〇〇将棋クラブ月例会', 'A1-2 〇〇将棋クラブ月例会');
  eq(C('高崎こども将棋クラブ 月例戦'), '高崎こども将棋クラブ 月例戦', 'A1-3 高崎こども将棋クラブ 月例戦');
  eq(C('MATSUMOTO月例CUP'), 'MATSUMOTO月例CUP', 'A1-4 MATSUMOTO月例CUP');
  eq(C('六月例会'), '六月例会', 'A1-5 六月例会（部分一致の誤爆が消えた）');
  eq(C('松本支部将棋大会'), '松本支部将棋大会', 'A1-6 対照: 月例を含まない名前も従来どおり');
})();

console.log('\n[A2] ★受け入れ基準1を「性質」で検査（allowlist / 対応表 実装を弾く）');
(function(){
  // 決定的な擬似乱数（実行ごとに揺れないこと＝失敗が再現すること）
  var seed=20260811;
  function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
  var parts=['支部','将棋','クラブ','こども','市民','オープン','杯','戦','会','大会','第3回','ABC','XYZ',
             '松本','高崎','三島','小田原','長野','ぬまづ','沼','津','東','西','南','北','　',' ','・','-','＆'];
  function gen(){
    var n=1+Math.floor(rnd()*5), s='';
    for(var i=0;i<n;i++)s+=parts[Math.floor(rnd()*parts.length)];
    var at=Math.floor(rnd()*(s.length+1));
    s=s.slice(0,at)+'月例'+s.slice(at);
    return s;
  }
  var N=3000, bad=[], skipped=0;
  // 「報告書」末尾・日付サフィックスの除去規則が絡む入力は、規則の対象なので除外して
  //   「集約されないこと」だけを純粋に見る（除去規則そのものは [B] で検査する）
  var dateRe=/[\s　]*[（(]?\s*(?:\d{4}[-\/]\d{1,2}(?:[-\/]\d{1,2})?|\d{4}年\d{1,2}月(?:\d{1,2}日)?度?)\s*[)）]?\s*$/;
  for(var k=0;k<N;k++){
    var x=gen();
    var t=x.trim();
    if(t===''||t.slice(-3)==='報告書'||dateRe.test(t)){skipped++;continue;}
    if(C(x)!==t)bad.push({in:x, out:C(x), want:t});
  }
  assert(bad.length===0,
    'A2-1 ランダム生成した「月例」入り '+(N-skipped)+' 件すべてで生名（trim のみ）が返る'
    +(bad.length?'（最初の不一致 '+JSON.stringify(bad[0])+'／計 '+bad.length+' 件）':''));
  assert(N-skipped>2000, 'A2-2 検査に使えた入力が十分ある（実測 '+(N-skipped)+' 件）');
  // 沼津へ倒れた件数を独立に数える（A2-1 とは別の見方）
  var toNumazu=0;
  for(var k2=0;k2<N;k2++){ var y=gen(); if(y.indexOf('沼津支部月例将棋大会')<0 && C(y)==='沼津支部月例将棋大会')toNumazu++; }
  assert(toNumazu===0, 'A2-3 生成入力のうち沼津へ集約されたものは0件（実測 '+toNumazu+' 件）');
})();

console.log('\n[B] 受け入れ基準3: 報告書除去・日付サフィックス除去は維持');
(function(){
  eq(C('○○杯 報告書'), '○○杯', 'B-1 末尾「報告書」除去');
  eq(C('○○杯2026-04'), '○○杯', 'B-2 日付サフィックス除去');
  eq(C('○○杯（2026-04）'), '○○杯', 'B-3 全角括弧の日付サフィックス除去');
  eq(C('支部対抗戦2025'), '支部対抗戦2025', 'B-4 年号だけの末尾は温存（従来どおり）');
  eq(C('月例将棋大会 報告書'), '月例将棋大会', 'B-5 月例を含む名前でも報告書除去は効く');
  eq(C('月例大会（2026-04）'), '月例大会', 'B-6 月例を含む名前でも日付除去は効く');
})();

console.log('\n[C] 受け入れ基準2: 空のときの既定（★パネル1巡目でクラブ設定案を撤回）');
(function(){
  const ls = env.localStorage;
  ls.removeItem(env.CLUB_PROFILE_KEY);
  eq(C(''), env.factoryReport().title, 'C-1 空文字は factory の大会名');
  eq(C('   '), env.factoryReport().title, 'C-2 空白のみも同じ');
  eq(C('報告書'), env.factoryReport().title, 'C-3 除去した結果が空になる場合も同じ');

  // ★ クラブ設定を入れても既定は変わらない（撤回した挙動が復活していないことの番人）
  //   理由: seedClubProfileOnce が初回起動で factory をシードするため他クラブでも効かない／
  //         表示時に profile を読むと過去大会の表示名が遡って変わる（CLUB-PROFILE-001 の設計原則違反）／
  //         保存失敗時のガード（#845/#847 Codex P1）をバイパスする
  ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:1,report:{title:'松本支部月例将棋大会'}}));
  eq(C(''), env.factoryReport().title, 'C-4 ★クラブ設定があっても既定は変わらない（表示層に profile を当てない）');
  eq(env.defaultCloudTournamentTitle(), env.factoryReport().title, 'C-5 defaultCloudTournamentTitle も同じ');
  ls.removeItem(env.CLUB_PROFILE_KEY);

  // ★ アプリ内で「空の既定」が2種類ある状態を作らない（パネルBの指摘）
  eq(C(''), env.normalizeReportTitle(''), 'C-6 ★空の既定が normalizeReportTitle と一致する（既定が2種類にならない）');

  // 参照透過性（localStorage に依存しない純関数に戻っていること）
  ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:1,report:{title:'X'}}));
  var a=C(''); ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:1,report:{title:'Y'}}));
  var b=C('');
  assert(a===b, 'C-7 ★同じ引数で常に同じ答え＝参照透過（クラブ設定を変えても過去大会の表示名が遡らない）');
  ls.removeItem(env.CLUB_PROFILE_KEY);
})();

console.log('\n[D] 月度プレフィックスの合成は不変');
(function(){
  eq(env.buildCloudTournamentDisplayTitle('松本支部月例将棋大会','2026-04-15'), '2026年4月度 松本支部月例将棋大会', 'D-1 他クラブ名に月度が付く');
  eq(env.buildCloudTournamentDisplayTitle('月例将棋大会2026-04','2026-04-15'), '2026年4月度 月例将棋大会', 'D-2 日付除去後に月度が付く');
  eq(env.buildCloudTournamentDisplayTitle('2026年4月度 ○○杯','2026-04-15'), '2026年4月度 ○○杯', 'D-3 二重付与ガードは従来どおり');
  eq(env.buildCloudTournamentDisplayTitle('○○杯',''), '○○杯', 'D-4 日付欠損時は月度を付けない（fail-soft）');
})();

console.log('\n[E] 受け入れ基準4: 同意文（★パネル1巡目で主催者差し込みを撤回）');
(function(){
  const st = env.state;
  const EXPECT = '本ツールは、この端末で運営する大会の運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。';
  // ★ 主催者名に何が入っていても文面が変わらないこと＝「主催者未設定の分岐が実機で到達不能」問題の根を断つ
  //   （normalizeReportOrganizer は空を factory の『日本将棋連盟沼津支部』へ戻すため、
  //     主催者を差し込む設計だと他クラブの端末で必ず沼津が主体になる。Codex P1・パネルB/C も同一指摘）
  var orgs=['', '   ', '日本将棋連盟沼津支部', '日本将棋連盟松本支部', '<script>x</script>', null, undefined, 123, {}, []];
  var got=[];
  for(var i=0;i<orgs.length;i++){
    st.report = env.factoryReport();
    try{ st.report.organizer = orgs[i]; }catch(e){}
    got.push(env.buildMasterConsentPurposeText());
  }
  var allSame=got.every(function(x){ return x===EXPECT; });
  assert(allSame, 'E-1 ★主催者名が何であっても同意文は同一（実機で到達不能な分岐を作らない）'
    +(allSame?'':'（実測 '+JSON.stringify(got.filter(function(x){return x!==EXPECT;})[0])+'）'));
  st.report = env.factoryReport();
  eq(env.buildMasterConsentPurposeText(), EXPECT, 'E-2 文面を literal で固定');
  assert(env.buildMasterConsentPurposeText().indexOf('沼津')<0, 'E-3 同意文に沼津が出ない');
  assert(RAW.indexOf('本ツールは沼津支部内の大会運営目的で')<0, 'E-4 ソースにも旧文言が残っていない');
  st.report = null;
  assert(env.buildMasterConsentPurposeText()===EXPECT, 'E-5 state.report が無くても例外を投げない');
  st.report = env.factoryReport();
})();

console.log('\n[F] ★一本化: 触った関数のソースに沼津リテラルを持たない');
(function(){
  var names=['canonicalizeCloudTournamentName','defaultCloudTournamentTitle','buildCloudTournamentDisplayTitle','buildMasterConsentPurposeText'];
  for(var i=0;i<names.length;i++){
    var src=fnSource(names[i]);
    assert(src!=='', 'F-'+(i+1)+'a '+names[i]+' のソースを取得できた');
    assert(src.indexOf('沼津')<0, 'F-'+(i+1)+'b '+names[i]+' の本体に沼津リテラルが無い（factoryReport 経由に一本化）');
  }
  assert(RAW.indexOf("s.indexOf('月例')>=0")<0, 'F-5 月例集約の分岐が消えている');
})();

console.log('\n[G] ★shogi_v4.html と app/auth.js の2実装が一致する（従来これを守る番人が無かった）');
(function(){
  var A=loadAuth();
  if(!A){ assert(false, 'G-0 app/auth.js から ShogiAuth を読み込めた'); return; }
  assert(true, 'G-0 app/auth.js から ShogiAuth を読み込めた');
  var cases=['松本支部月例将棋大会','〇〇将棋クラブ月例会','高崎こども将棋クラブ 月例戦','MATSUMOTO月例CUP',
             '六月例会','月例将棋大会','月例将棋大会2026-04','月例将棋大会 報告書','月例大会（2026-04）',
             '松本支部将棋大会','○○杯 報告書','○○杯2026-04','支部対抗戦2025','','   ','報告書'];
  var diff=[];
  for(var i=0;i<cases.length;i++){
    var a=C(cases[i]), b=A.canonicalizeCloudTournamentName(cases[i]);
    if(a!==b)diff.push({in:cases[i], v4:a, auth:b});
  }
  assert(diff.length===0, 'G-1 代表16件で2実装の戻り値が一致（実測の不一致 '+JSON.stringify(diff)+'）');
  var d2=[];
  for(var j=0;j<cases.length;j++){
    var x=env.buildCloudTournamentDisplayTitle(cases[j],'2026-04-15');
    var y=A.buildCloudTournamentDisplayTitle(cases[j],'2026-04-15');
    if(x!==y)d2.push({in:cases[j], v4:x, auth:y});
  }
  assert(d2.length===0, 'G-2 表示タイトルの合成も一致（実測の不一致 '+JSON.stringify(d2)+'）');
  var authSrc=fs.readFileSync(AUTH_PATH,'utf8');
  assert(authSrc.indexOf("s.indexOf('月例')>=0")<0, 'G-3 app/auth.js からも月例集約の分岐が消えている');
})();

console.log('\n  NUMAZU-BEHAVIOR-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
