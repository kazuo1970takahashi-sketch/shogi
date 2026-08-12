#!/usr/bin/env node
// @suite: NUMAZU-BEHAVIOR-001（#840）性質検査 — 生成コーパス・2実装の一致・cache-bust の下限
//
// ★ このファイルの位置づけ（2026-08-12・PR #859 で作者裁定を反映して書き直した）
//   #840 には実装 PR が2本あった。作者裁定は **#857 の案A**（打った文字をそのまま出す＝
//   #608 の3整形をすべて撤去）で、#856（月例集約だけ撤去し「報告書」除去・日付除去は維持）は
//   revert された。受け入れ基準1〜7 の実例検査は #857 の test/test_numazu_behavior_001.js が持つ。
//
//   ここは **#856 側にしか無かった検査**だけを残す。重複は置かない:
//     [P] 入力集合に依存しない**性質**（ランダム生成した大量入力の全件）
//     [Q] shogi_v4.html と app/auth.js の2実装が**同じ生成コーパス全件で**一致
//     [R] 触った関数のソースに沼津リテラル・月例分岐が無い（形で守る）
//     [S] app/index.html の cache-bust 番号の下限（#343 の巻き戻し防止）
//
//   なぜ性質検査が要るか: 初版のテストは固定入力しか見ていなかったため、
//   「テストに出てくる名前だけ素通しする allowlist」や「対応表を持つだけの実装」で
//   **全テストが緑になった**（反証パネルが実演）。固定値の一覧は、その形の実装を弾けない。
//
//   なぜ2実装を**同じコーパスで**突き合わせるか: 片側の固定ケースだけを allowlist した
//   app/auth.js は、代表値の一致検査を通り抜ける（Codex 指摘・実測で確認済み）。
//
//   入力は完全架空。shogi_v4.html / app/auth.js / app/index.html は読むだけ。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_numazu_behavior_840.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);
const RAW = fs.readFileSync(ABS,'utf8');
const AUTH_PATH = path.join(__dirname,'..','app','auth.js');
const APP_INDEX_PATH = path.join(__dirname,'..','app','index.html');

let pass=0, fail=0;
function assert(cond, msg){ if(cond){ pass++; console.log('  ✓ '+msg); } else { fail++; console.log('  ✗ '+msg); } }

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
              localStorage:localStorage, state:state };`);
  return fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});
}
// app/auth.js 側の同名関数を取り出す（ShogiAuth の public export）
function loadAuth(){
  if(!fs.existsSync(AUTH_PATH))return null;
  const src=fs.readFileSync(AUTH_PATH,'utf8');
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

// 触った関数のソース本体を取り出す（形の検査用）
function fnSourceFrom(src, name){
  const i=src.indexOf('function '+name+'(');
  if(i<0)return '';
  let depth=0, started=false;
  for(let j=i;j<src.length;j++){
    const ch=src[j];
    if(ch==='{'){depth++;started=true;}
    else if(ch==='}'){depth--; if(started&&depth===0)return src.slice(i,j+1);}
  }
  return '';
}

// ★ 決定的な擬似乱数（実行ごとに揺れない＝失敗が再現する）。[P] と [Q] で**同じ物**を使う。
function makeCorpus(n, seed0){
  var seed=seed0;
  function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
  var parts=['支部','将棋','クラブ','こども','市民','オープン','杯','戦','会','大会','第3回','ABC','XYZ',
             '松本','高崎','三島','小田原','長野','ぬまづ','沼','津','東','西','南','北','　',' ','・','-','＆',
             '報告書','2026-04','（2026-04）','2026年4月度'];
  var out=[];
  for(var k=0;k<n;k++){
    var m=1+Math.floor(rnd()*5), s='';
    for(var i=0;i<m;i++)s+=parts[Math.floor(rnd()*parts.length)];
    var at=Math.floor(rnd()*(s.length+1));
    out.push(s.slice(0,at)+'月例'+s.slice(at));
  }
  return out;
}

const EMPTY_DEFAULT='(名称未設定)';

console.log('\n[P] ★性質: 生成した入力**全件**で「trim しただけ」が返る（案A・allowlist / 対応表 実装を弾く）');
(function(){
  // ★ 案A では除去規則そのものが無いので、#856 版にあった「日付・報告書で終わる入力を除外」が要らない。
  //   入力を1件も除外しないぶん、#856 版より強い検査になっている。
  var N=3000, corpus=makeCorpus(N,20260811), bad=[];
  for(var k=0;k<corpus.length;k++){
    var x=corpus[k], want=x.trim(), got=C(x);
    if(want==='')want=EMPTY_DEFAULT;
    if(got!==want&&bad.length<5)bad.push({in:x, out:got, want:want});
  }
  assert(bad.length===0,
    'P-1 生成 '+N+' 件すべてで trim しただけの値が返る（除去も置換もしない）'
    +(bad.length?'（最初の不一致 '+JSON.stringify(bad[0])+'）':''));

  // 沼津へ倒れた件数を独立に数える（P-1 とは別の見方）
  var corpus2=makeCorpus(N,20260812), toNumazu=0;
  for(var k2=0;k2<corpus2.length;k2++){ var y=corpus2[k2]; if(y.trim()!=='沼津支部月例将棋大会' && C(y)==='沼津支部月例将棋大会')toNumazu++; }
  assert(toNumazu===0, 'P-2 生成入力のうち沼津へ集約されたものは0件（実測 '+toNumazu+' 件）');

  // 「報告書」「日付サフィックス」を含む入力が削られていないこと（案A の[反転] pin を性質側でも押さえる）
  var corpus3=makeCorpus(N,20260813), trimmed=0;
  for(var k3=0;k3<corpus3.length;k3++){ var z=corpus3[k3].trim(); if(z!==''&&C(corpus3[k3]).length<z.length)trimmed++; }
  assert(trimmed===0, 'P-3 生成入力のうち末尾を削られたものは0件（「報告書」除去・日付除去の撤去を性質で固定・実測 '+trimmed+' 件）');

  // 冪等（2回通しても変わらない＝表示のたびに名前が痩せない）
  var corpus4=makeCorpus(500,20260814), notIdem=[];
  for(var k4=0;k4<corpus4.length;k4++){ var a=C(corpus4[k4]); if(C(a)!==a&&notIdem.length<3)notIdem.push({in:corpus4[k4],once:a,twice:C(a)}); }
  assert(notIdem.length===0, 'P-4 冪等（f(f(x))===f(x)）'+(notIdem.length?'（実測 '+JSON.stringify(notIdem[0])+'）':''));
})();

console.log('\n[Q] ★shogi_v4.html と app/auth.js の2実装が**生成コーパス全件**で一致する');
(function(){
  var A=loadAuth();
  if(!A){ assert(false, 'Q-0 app/auth.js から ShogiAuth を読み込めた'); return; }
  assert(true, 'Q-0 app/auth.js から ShogiAuth を読み込めた');

  // ★ 代表値だけの一致検査では「その代表値だけ allowlist した app/auth.js」を弾けない。
  //   同じ 3000 件を両実装に通す（Codex 指摘・実測で allowlist 実装が落ちることを確認済み）。
  var corpus=makeCorpus(3000,20260811), d1=[], numazuAuth=0;
  for(var i=0;i<corpus.length;i++){
    var s=corpus[i];
    var a=C(s), b=A.canonicalizeCloudTournamentName(s);
    if(a!==b&&d1.length<5)d1.push({in:s, v4:a, auth:b});
    if(s.trim()!=='沼津支部月例将棋大会' && b==='沼津支部月例将棋大会')numazuAuth++;
  }
  assert(d1.length===0, 'Q-1 生成 '+corpus.length+' 件すべてで2実装の戻り値が一致'
    +(d1.length?'（最初の不一致 '+JSON.stringify(d1[0])+'）':''));
  assert(numazuAuth===0, 'Q-2 app/auth.js 側も生成入力を沼津へ集約しない（実測 '+numazuAuth+' 件）');

  var d2=[];
  for(var j=0;j<corpus.length;j++){
    var t=corpus[j];
    var x=env.buildCloudTournamentDisplayTitle(t,'2026-04-15');
    var y=A.buildCloudTournamentDisplayTitle(t,'2026-04-15');
    if(x!==y&&d2.length<5)d2.push({in:t, v4:x, auth:y});
  }
  assert(d2.length===0, 'Q-3 表示タイトルの合成も生成コーパス全件で一致'
    +(d2.length?'（最初の不一致 '+JSON.stringify(d2[0])+'）':''));

  // 空の既定が2実装で同じ（片方だけ沼津に戻る事故の番人）
  var empties=['','   ','　','\t'];
  var de=[];
  for(var e=0;e<empties.length;e++){
    var av=C(empties[e]), bv=A.canonicalizeCloudTournamentName(empties[e]);
    if(!(av===bv&&av===EMPTY_DEFAULT))de.push({in:JSON.stringify(empties[e]), v4:av, auth:bv});
  }
  assert(de.length===0, 'Q-4 空入力の既定が両実装とも '+EMPTY_DEFAULT+'（実測の不一致 '+JSON.stringify(de)+'）');
})();

console.log('\n[R] ★形で守る: 触った関数に沼津リテラル・月例分岐が無い');
(function(){
  var authSrc=fs.existsSync(AUTH_PATH)?fs.readFileSync(AUTH_PATH,'utf8'):'';
  var names=['canonicalizeCloudTournamentName','buildCloudTournamentDisplayTitle'];
  for(var i=0;i<names.length;i++){
    var s1=fnSourceFrom(RAW,names[i]);
    assert(s1!=='', 'R-'+(i+1)+'a shogi_v4.html から '+names[i]+' のソースを取得できた');
    assert(s1.indexOf('沼津')<0, 'R-'+(i+1)+'b shogi_v4.html の '+names[i]+' 本体に沼津リテラルが無い');
    var s2=fnSourceFrom(authSrc,names[i]);
    assert(s2!=='', 'R-'+(i+1)+'c app/auth.js から '+names[i]+' のソースを取得できた');
    assert(s2.indexOf('沼津')<0, 'R-'+(i+1)+'d app/auth.js の '+names[i]+' 本体に沼津リテラルが無い');
  }
  assert(RAW.indexOf("s.indexOf('月例')>=0")<0, 'R-5 shogi_v4.html から月例集約の分岐が消えている');
  assert(authSrc.indexOf("s.indexOf('月例')>=0")<0, 'R-6 app/auth.js から月例集約の分岐が消えている');
  assert(RAW.indexOf('本ツールは沼津支部内の大会運営目的で')<0, 'R-7 同意文の旧文言がソースに残っていない');
})();

console.log('\n[S] ★app/ の cache-bust 番号（#343 ロールバック事故の番人）');
(function(){
  // app/auth.js を変えたら app/index.html の ?v=N をバンプする規則（#343）。
  //   ただし app/ はリリース列車（shogi_v4.html / index.html / sw.js / docs/manual_*.html の5ファイル）
  //   で運ばず別系統で同期するため、dev と production で番号がずれる。
  //   実測 2026-08-12: production=44 / dev=42 → 素朴に 43 へ上げると production から見て
  //   **番号が戻り**、#343 のロールバック事故そのものを再現する。
  //   ここは「production の実測値 44 を必ず上回る」floor を固定して、その巻き戻しを弾く。
  //
  //   ※ SW のオフライン経路では ?v= 自体が効かない（PRECACHE の bare エントリが
  //     ignoreSearch で先にマッチする）。これは #858 [SW-QUERY-CACHE-001] の管轄で、
  //     実際の無効化は sw.js の CACHE 名バンプで行う。ここは HTTP キャッシュ側と
  //     #343 規約の番人。
  assert(fs.existsSync(APP_INDEX_PATH), 'S-0 app/index.html がある');
  if(!fs.existsSync(APP_INDEX_PATH))return;
  var src=fs.readFileSync(APP_INDEX_PATH,'utf8');
  var m=src.match(/auth\.js\?v=(\d+)/);
  assert(!!m, 'S-1 auth.js?v=N の指定がある');
  if(!m)return;
  var v=Number(m[1]);
  assert(v>44, 'S-2 cache-bust 番号が production 実測値 44 を上回る（実測 v='+v+'・#343 の番号巻き戻し防止）');
  assert(src.indexOf('auth.js"')<0&&src.indexOf("auth.js'")<0, 'S-3 cache-bust 無しの auth.js 読み込みが混ざっていない');
})();

console.log('\n  NUMAZU-BEHAVIOR-001 (性質検査): PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
