#!/usr/bin/env node
// NUMAZU-BEHAVIOR-001 (#840) — 沼津固有が「文言」ではなく「挙動」として埋まっていた2箇所を外したことの受入テスト。
//   ① canonicalizeCloudTournamentName の3整形（末尾「報告書」除去・末尾日付除去・「月例」→沼津名の集約）を撤去し、
//      入力された大会名をそのまま表示する（shogi_v4.html と app/auth.js の**両実装**）。
//   ② 会員名簿タブの同意文の主体を、報告書の主催者から**生のまま**取る（未設定なら主体を書かない）。
//   ③ 送信前確認（#622）に大会名を並べる（作者決定 2026-08-11）。
//   受け入れ基準1（allowlist 実装は不可）・2（空の既定）・3（他の整形は無い）・4（同意文の literal）・
//   7（ローカル履歴とクラウド一覧の表記が揃う）に対応する。入力は完全架空。実データ・実ネットワーク不使用。
var fs=require('fs');
var path=require('path');
var TARGET=process.argv[2]||path.join(__dirname,'..','shogi_v4.html');
var RAW=fs.readFileSync(TARGET,'utf8');
var AUTH_JS=fs.readFileSync(path.join(path.dirname(TARGET),'app','auth.js'),'utf8');

var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

function extractScripts(h){var s=[],re=/<script[^>]*>([\s\S]*?)<\/script>/g,m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
function makeContext(){
  function n(t){return{nodeType:1,tagName:String(t||'div'),id:'',className:'',value:'',innerHTML:'',textContent:'',style:{},_attrs:{},childNodes:[],
    appendChild:function(c){this.childNodes.push(c);return c;},removeChild:function(){},
    setAttribute:function(k,v){this._attrs[k]=String(v);},getAttribute:function(k){return (k in this._attrs)?this._attrs[k]:null;},
    addEventListener:function(){},removeEventListener:function(){},select:function(){},
    querySelector:function(){return null;},querySelectorAll:function(){return[];}};}
  var el={};
  var doc={getElementById:function(i){if(!el[i]){var x=n('div');x.id=i;el[i]=x;}return el[i];},
    createElement:function(t){return n(t);},createTextNode:function(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    body:n('body'),head:n('head'),addEventListener:function(){},removeEventListener:function(){},
    querySelector:function(){return null;},querySelectorAll:function(){return[];},execCommand:function(){return true;}};
  var win={innerWidth:1024,addEventListener:function(){},removeEventListener:function(){},
    open:function(){return{focus:function(){},addEventListener:function(){},print:function(){},close:function(){}};}};
  var ls={_:{},getItem:function(k){return(k in this._)?this._[k]:null;},setItem:function(k,v){this._[k]=String(v);},removeItem:function(k){delete this._[k];}};
  return{document:doc,window:win,localStorage:ls};
}
function loadEnv(){
  var ctx=makeContext();var js=extractScripts(RAW);var noop=function(){};
  var fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    js+';return { canonicalizeCloudTournamentName:canonicalizeCloudTournamentName,'
      +' buildCloudTournamentDisplayTitle:buildCloudTournamentDisplayTitle,'
      +' buildMasterTabHtml:buildMasterTabHtml, normalizeReportTitle:normalizeReportTitle,'
      +' normalizeReportOrganizer:normalizeReportOrganizer, factoryReport:factoryReport,'
      +' _setReportOrganizer:function(v){ if(!state.report)state.report={}; state.report.organizer=v; } };');
  return fn(ctx.document,ctx.window,ctx.localStorage,{randomUUID:function(){return '00000000-0000-0000-0000-000000000000';}},
    noop,function(){return true;},function(){return '';},noop,noop,
    {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},
    {log:noop,warn:noop,error:noop},Promise,function(){return 0;},{onLine:false});
}
function loadAuth(){var win={location:{origin:'https://app.test',pathname:'/app/'}};new Function('window',AUTH_JS)(win);return win.ShogiAuth;}
var E=loadEnv();
var A=loadAuth();
var EMPTY_MASTER={schema_version:1,members:[]};

// ============================================================================
// N. ① 大会名は入力どおり（受け入れ基準1）— shogi_v4.html と app/auth.js の両方
// ============================================================================
console.log('=== N: 大会名は入力どおり（両実装） ===');
// 受け入れ基準1が名指しした4件。allowlist（'松本' を含むときだけ素通し等）では通らないよう、
// クラブ名・表記・言語をばらして並べてある。
var KEEP=[
  ['松本支部月例将棋大会','N1 他支部の月例大会'],
  ['〇〇将棋クラブ月例会','N2 クラブの月例会'],
  ['高崎こども将棋クラブ 月例戦','N3 空白入り・こども教室'],
  ['MATSUMOTO月例CUP','N4 英字混じり'],
  ['六月例会','N5 「六月」＋「例会」の誤爆ケース'],
  ['沼津支部月例将棋大会','N6 沼津の正規名（表示は変わらない＝受け入れ基準5）'],
  ['月例将棋大会','N7 沼津の揺れた生名もそのまま（基準5で許容）'],
  ['8月度月例会','N8 月度入りの生名もそのまま']
];
for(var i=0;i<KEEP.length;i++){
  eq(E.canonicalizeCloudTournamentName(KEEP[i][0]),KEEP[i][0],KEEP[i][1]+'（本体）');
  eq(A.canonicalizeCloudTournamentName(KEEP[i][0]),KEEP[i][0],KEEP[i][1]+'（app/auth.js）');
}

// ---- 受け入れ基準2: 空のときの既定（#839 論点5 と同一の決定 → '(名称未設定)'）----
console.log('=== N: 空の既定（受け入れ基準2） ===');
eq(E.canonicalizeCloudTournamentName(''),'(名称未設定)','N9 空→(名称未設定)（本体）');
eq(A.canonicalizeCloudTournamentName(''),'(名称未設定)','N9b 空→(名称未設定)（app）');
eq(E.canonicalizeCloudTournamentName('   '),'(名称未設定)','N10 空白のみ→(名称未設定)（本体）');
eq(A.canonicalizeCloudTournamentName('   '),'(名称未設定)','N10b 空白のみ→(名称未設定)（app）');
eq(E.canonicalizeCloudTournamentName(null),'(名称未設定)','N11 null→(名称未設定)（本体）');
eq(A.canonicalizeCloudTournamentName(null),'(名称未設定)','N11b null→(名称未設定)（app）');
ok(E.canonicalizeCloudTournamentName('').indexOf('沼津')<0,'N12 空の既定に沼津が生えない（本体）');
ok(A.canonicalizeCloudTournamentName('').indexOf('沼津')<0,'N12b 空の既定に沼津が生えない（app）');

// ---- 受け入れ基準3の反転: 「報告書」除去・末尾日付除去も**もう効かない** ----
//   基準3は起票時「維持する」だったが、作者決定 2026-08-11（案A＝全部外す）でこれも撤去された。
//   打った文字がそのまま出るのが唯一の規則で、例外を作らない。
console.log('=== N: 他の整形も無い（案A＝全部外す） ===');
eq(E.canonicalizeCloudTournamentName('月例将棋大会 報告書'),'月例将棋大会 報告書','N13 [反転] 末尾「報告書」も残す（本体）');
eq(A.canonicalizeCloudTournamentName('月例将棋大会 報告書'),'月例将棋大会 報告書','N13b [反転] 同上（app）');
eq(E.canonicalizeCloudTournamentName('○○杯2026-04'),'○○杯2026-04','N14 [反転] 末尾日付も残す（本体）');
eq(A.canonicalizeCloudTournamentName('○○杯2026-04'),'○○杯2026-04','N14b [反転] 同上（app）');
eq(E.canonicalizeCloudTournamentName('  ○○杯  '),'○○杯','N15 前後の空白だけは落とす（唯一の加工）');
eq(A.canonicalizeCloudTournamentName('  ○○杯  '),'○○杯','N15b 同上（app）');

// ---- 二重実装が食い違わないこと（#840 論点2・統合は別便）----
console.log('=== N: 二重実装の同値性 ===');
var SAME=['松本支部月例将棋大会','〇〇将棋クラブ月例会','六月例会','月例将棋大会 報告書','○○杯2026-04','','   ','沼津支部月例将棋大会','8月度月例会','支部対抗戦2025'];
var allSame=true;
for(var j=0;j<SAME.length;j++){
  if(E.canonicalizeCloudTournamentName(SAME[j])!==A.canonicalizeCloudTournamentName(SAME[j])){
    allSame=false;console.log('    差分: 「'+SAME[j]+'」本体=「'+E.canonicalizeCloudTournamentName(SAME[j])+'」app=「'+A.canonicalizeCloudTournamentName(SAME[j])+'」');
  }
}
ok(allSame,'N16 shogi_v4.html と app/auth.js が全ケースで同値（片側だけ直す事故の番人）');
ok(RAW.indexOf("indexOf('月例')")<0,'N17 本体に「月例」判定の残骸が無い');
ok(AUTH_JS.indexOf("indexOf('月例')")<0,'N17b app/auth.js に「月例」判定の残骸が無い');

// ============================================================================
// N. 受け入れ基準7: ローカル履歴（生名）とクラウド一覧（正規化後）の表記が揃う
// ============================================================================
console.log('=== N: ローカル履歴⇔クラウド一覧の表記一致（受け入れ基準7） ===');
// ローカル履歴 renderHistoryList は identity.title を**生のまま**出す（正規化を通さない）。
// クラウド一覧は buildCloudTournamentDisplayTitle 経由。名前の部分が一致していれば
// 「同じ1回の大会が上下で別名になる」（#840 本文の実測）が再発しない。
var PAIRS=[['松本支部月例将棋大会','2026-08-09'],['六月例会','2026-06-14'],['沼津支部月例将棋大会','2026-07-12'],['第10回沼津竜王戦','2026-05-10']];
var aligned=true;
for(var k=0;k<PAIRS.length;k++){
  var rawTitle=PAIRS[k][0];
  var cloud=E.buildCloudTournamentDisplayTitle(rawTitle,PAIRS[k][1]);
  if(cloud.indexOf(rawTitle)<0){aligned=false;console.log('    不一致: ローカル「'+rawTitle+'」/ クラウド「'+cloud+'」');}
}
ok(aligned,'N18 クラウド一覧の表示名にローカル履歴の生名がそのまま含まれる（上下で別名にならない）');
// #840 論点5（月度プレフィックスとの相互作用）の裁定を明示的に固定する。
//   '8月度月例会' のような生名だと「2026年8月度 8月度月例会」と月度が二重に見える。
//   **許容する**。月度は date から機械的に付ける別の情報で、大会名は打った文字そのもの。
//   ここでガードを広げると「打った文字の一部を消す」ことになり、案A（全部外す）と矛盾する。
eq(E.buildCloudTournamentDisplayTitle('8月度月例会','2026-08-09'),'2026年8月度 8月度月例会','N18b [裁定] 月度の重複は許容（大会名は削らない）');
eq(E.buildCloudTournamentDisplayTitle('2026年4月度 特別戦','2026-04-15'),'2026年4月度 特別戦','N18c 先頭の完全一致 period だけは従来どおり二重付与しない（#608 P2 は温存）');

// ============================================================================
// N. ② 同意文（受け入れ基準4）
// ============================================================================
console.log('=== N: 同意文の主体（受け入れ基準4） ===');
ok(RAW.indexOf('本ツールは沼津支部内の大会運営目的で')<0,'N19 沼津固定の同意文が本体から消えている');
// 同意文の段落だけを切り出して見る。見出し「沼津支部 参加者マスタ」やラベル「沼津支部員」は
// #840 のスコープ外（読み替えれば済む文言）なので、タブ全体の grep では判定しない。
function consentPara(html){
  var m=html.match(/本ツールは[\s\S]*?この端末内に保存します。/);
  return m?m[0]:'';
}
// 主催者未設定（空）→ 主体を書かない。この literal を固定する。
E._setReportOrganizer('');
var c0=consentPara(E.buildMasterTabHtml(EMPTY_MASTER));
eq(c0,'本ツールは大会運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。',
   'N20 主催者未設定→主体を書かない（literal 固定）');
ok(c0.indexOf('沼津')<0,'N21 主催者未設定でも沼津の名前が同意文に出ない（normalizeReportOrganizer を使わない証拠）');
// 主催者を設定 → その名前が主体になる。
E._setReportOrganizer('日本将棋連盟松本支部');
var c1=consentPara(E.buildMasterTabHtml(EMPTY_MASTER));
eq(c1,'本ツールは日本将棋連盟松本支部の大会運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。',
   'N22 主催者設定→その名前が主体（literal 固定）');
ok(c1.indexOf('沼津')<0,'N23 松本の幹事の同意文に沼津が出ない');
// 沼津の幹事は従来どおり沼津が出る（非回帰）。
E._setReportOrganizer('日本将棋連盟沼津支部');
ok(consentPara(E.buildMasterTabHtml(EMPTY_MASTER)).indexOf('本ツールは日本将棋連盟沼津支部の大会運営目的で')>=0,'N24 沼津の幹事には従来どおり沼津（非回帰）');
// XSS: 主催者名は escapeHtml 経由。
E._setReportOrganizer('<b>支部');
var c3=consentPara(E.buildMasterTabHtml(EMPTY_MASTER));
ok(c3.indexOf('&lt;b&gt;支部')>=0&&c3.indexOf('本ツールは<b>支部の')<0,'N25 主催者名は esc 経由（XSS 安全）');
// 前後空白のみ → 未設定と同じ扱い（全角空白含む）。
E._setReportOrganizer('　 　');
ok(consentPara(E.buildMasterTabHtml(EMPTY_MASTER)).indexOf('本ツールは大会運営目的で')>=0,'N26 空白のみ（全角含む）は未設定扱い');
E._setReportOrganizer('日本将棋連盟沼津支部');

// ============================================================================
// N. ③ 送信前確認に大会名（作者決定 2026-08-11）
// ============================================================================
console.log('=== N: 送信前確認に大会名 ===');
ok(RAW.indexOf('この内容でクラウドに記録します')>=0,'N27 確認文言（この内容でクラウドに記録します）');
ok(/大会名   '\+\(_recTitle\|\|'\(名称未設定\)'\)/.test(RAW),'N28 大会名の行（未設定は (名称未設定)）');
ok(RAW.indexOf('実施日   ')>=0,'N29 実施日の行は温存（#622 の確認は消していない）');
var iTitleGate=RAW.indexOf('NUMAZU-BEHAVIOR-001 (#840・作者決定 2026-08-11)');
var iSending=RAW.indexOf("setStatus('クラウドへ送信中…')");
ok(iTitleGate>=0&&iSending>=0&&iTitleGate<iSending,'N30 確認は送信開始より前');
ok(RAW.indexOf('送信を中止しました（報告書タブで大会名・実施日を確認・修正してから再送信してください）')>=0,
   'N31 中止時の案内が大会名にも触れる');

console.log('\nNUMAZU-BEHAVIOR-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
