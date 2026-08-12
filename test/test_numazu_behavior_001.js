#!/usr/bin/env node
// NUMAZU-BEHAVIOR-001 (#840) — 沼津固有が「文言」ではなく「挙動」として埋まっていた2箇所を外したことの受入テスト。
//   ① canonicalizeCloudTournamentName の3整形（末尾「報告書」除去・末尾日付除去・「月例」→沼津名の集約）を撤去し、
//      入力された大会名をそのまま表示する（shogi_v4.html と app/auth.js の**両実装**）。
//   ② 会員名簿タブの同意文から**主体そのものを外す**（作者決定 2026-08-12・#840 論点6 の第2案）。
//      ★初版は「報告書の主催者を生のまま差し込む」実装だったが、Codex P1（PR #857）のとおり
//        このアプリには「主催者を設定していない」と「主催者が沼津」を区別する手段が無く
//        （factory 既定・normalizeReportOrganizer・seedClubProfileOnce・sanitizeClubProfileObject が
//        すべて '日本将棋連盟沼津支部' へ倒す）、他クラブの画面に沼津が出ていた。この契約は**破棄**。
//        現在の不変条件は「organizer が何であっても同意文は同一の一般文」。差し込みを復活させないこと。
//   ③ 送信前確認（#622）に大会名を並べる（作者決定 2026-08-11）。確認した内容は payload 生成の直前まで
//      凍結し、非同期区間中に報告書が編集されていたら送信を中止する（Codex P2・PR #857 2巡目）。
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
var CONSENT='本ツールは、大会運営の目的で参加者の氏名・参加履歴をこの端末内に保存します。';
// 受け入れ基準4: 文面を先に確定し、その文字列を literal で assert（作者決定 2026-08-12）。
eq(consentPara(E.buildMasterTabHtml(EMPTY_MASTER)),CONSENT,'N20 同意文の literal 固定');
// ★Codex P1（PR #857）の番人。初版は state.report.organizer を差し込む実装で、テストも
//   organizer='' を直接代入して緑にしていた。しかし実アプリでは organizer が空になる経路が無く
//   （factory 既定・normalizeReportOrganizer・seedClubProfileOnce・sanitizeClubProfileObject の
//   4つが全部 '日本将棋連盟沼津支部' へ倒す＝実機で再現）、松本のクラブの画面に沼津が出ていた。
//   作者決定で主体を名乗らない一般文にしたので、**organizer が何であっても同意文は不変**。
//   organizer を実アプリで起きうる全パターンに振って、それを確かめる（直接代入で緑にしない）。
var ORG_CASES=[
  ['日本将棋連盟沼津支部','factory 既定のまま（初回起動・全リセット直後・シード済み profile）'],
  ['日本将棋連盟松本支部','他クラブが打ち替えた'],
  ['','空（現状この経路は無いが将来 emptyable 化しても不変であること）'],
  ['　 　','空白のみ（全角含む）'],
  ['<b>支部','HTML を含む名前'],
  [null,'null'],
  [undefined,'undefined'],
  [12345,'非文字列']
];
var consentStable=true;
for(var m2=0;m2<ORG_CASES.length;m2++){
  E._setReportOrganizer(ORG_CASES[m2][0]);
  var got=consentPara(E.buildMasterTabHtml(EMPTY_MASTER));
  if(got!==CONSENT){consentStable=false;console.log('    差分（'+ORG_CASES[m2][1]+'）: 「'+got+'」');}
}
ok(consentStable,'N21 organizer が何であっても同意文は不変（実アプリで起きうる8パターン）');
E._setReportOrganizer('日本将棋連盟沼津支部');
var cNow=consentPara(E.buildMasterTabHtml(EMPTY_MASTER));
ok(cNow.indexOf('沼津')<0,'N22 factory 既定（沼津）のままでも同意文に沼津が出ない');
ok(cNow.indexOf('支部')<0,'N23 特定のクラブ形態（支部）も名乗らない');
// 実装に分岐が無いこと自体を pin する（分岐が生えたら再混入の余地が戻る）。
//   ★Codex P2（PR #857 2巡目）: 初版は「'本ツールは' の直後にある最初の `</div>'`」を終端にしていた。
//     同意ブロックに入れ子の <div> が入ると窓が**黙って縮み**、その閉じタグより後ろに organizer 依存の
//     式を足しても N24pre / N24 / N25 が全部通ってしまう（実行時 assert も「この端末内に保存します。」
//     までしか見ていないので拾えない）。終端を内側のタグに預けるのをやめ、
//     **「<h3>利用目的</h3> から buildMasterTabHtml の終わり（＝次の関数定義）まで」**を窓にする。
//     見出し「沼津支部 参加者マスタ」は 利用目的 より前にあるので窓に入らない＝N25 は誤検知しない。
//     コメント行は除去する（説明のために沼津や organizer を書けるようにするため）。
var _cf=RAW.indexOf('function buildMasterTabHtml(');
var _ci1=(_cf>=0)?RAW.indexOf('<h3>利用目的</h3>',_cf):-1;
var _ci2=(_ci1>=0)?RAW.indexOf('\nfunction ',_ci1):-1;
var consentSrc=(_ci1>=0)?RAW.slice(_ci1,(_ci2>_ci1)?_ci2:RAW.length).replace(/^[ \t]*\/\/.*$/gm,''):'';
ok(consentSrc!==''&&consentSrc.indexOf('本ツールは')>=0&&consentSrc.indexOf('この端末内に保存します。')>=0,
   'N24pre 同意文を含む窓（利用目的〜関数末尾）を切り出せた（切り出し失敗による誤 PASS を防ぐ）');
ok(_ci2>_ci1,'N24pre2 窓の終端が関数の外側（次の関数定義）で取れている＝内側のタグに依存しない');
ok(consentSrc.indexOf('_consentOrg')<0&&consentSrc.indexOf('organizer')<0,
   'N24 同意文の組み立てが organizer を参照しない（分岐ゼロ＝再混入経路ゼロ）');
ok(consentSrc.indexOf('沼津')<0,'N25 同意文の窓に沼津リテラルが無い');
// 到達性: 会員0件（初回起動）でも出る＝#840 本文の実測どおり。
ok(consentPara(E.buildMasterTabHtml({schema_version:1,members:[]}))===CONSENT,'N26 データ0件（初回起動）でも同意文が出る');

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

// ---- Codex P2（PR #857 2巡目）: STYLE-GUIDE §3 N1 / §4.2 の confirm 文体 ----
console.log('=== N: 確認文体（STYLE-GUIDE §4.2） ===');
var _dm1=RAW.indexOf("var _dmsg='この内容でクラウドに記録します。");
var _dm2=RAW.indexOf('\n',RAW.indexOf('よろしいですか？',_dm1));
var dmsgSrc=(_dm1>=0&&_dm2>_dm1)?RAW.slice(_dm1,_dm2):'';
ok(dmsgSrc!=='','N32pre 確認文言の組み立てを切り出せた');
ok(dmsgSrc.indexOf('よろしいですか？')>=0,'N32 §4.2 テンプレートの結び「よろしいですか？」がある');
ok(dmsgSrc.indexOf('送信を取り消すボタンはありません')>=0,'N33 §4.2「戻せないこと」＝取り消す手段が無いことを明記');
ok(dmsgSrc.indexOf('大会履歴にこの名前と日付が残ります')>=0,'N34 §4.2「何が起きるか」＝共有履歴に残ることを明記');
ok(dmsgSrc.indexOf('同じ大会として送り直します')>=0,'N35 §4.3 失敗時は次の行動を1つ添える（直し方）');
// 「取り消せません」と言い切らない（同一大会IDの再送で upsert され実際は直せる＝嘘になる）。
ok(dmsgSrc.indexOf('取り消せません')<0&&dmsgSrc.indexOf('元に戻せません')<0,'N36 直せるのに「取り消せない」と断定しない（§4.3 由来に依存した断定をしない）');
ok(/okText:'この内容で送信'/.test(RAW),'N37 肯定ボタンが操作名（既定の「はい」で流さない）');

// ---- Codex P2（PR #857 2巡目）: 確認内容の凍結と照合 ----
console.log('=== N: 確認内容の凍結（送信中の編集検知） ===');
ok(RAW.indexOf('_confirmedSend={title:_recTitle,date:_recDate}')>=0,'N38 確認時に大会名・実施日を凍結する');
ok(RAW.indexOf("step:'changed-after-confirm'")>=0,'N39 食い違ったら専用の中止経路へ');
// 巻き上げ事故の番人（PR #847 P16-1 と同型）: appConfirm はテスト解決器で onResult を同期で呼ぶため、
//   `var _confirmedSend=null;` が _dateGate() より後ろにあると凍結値が直後に null へ戻り照合が黙って死ぬ。
var iDecl=RAW.indexOf('var _confirmedSend=null;');
var iGate=RAW.indexOf('function _dateGate()');
var iFreeze=RAW.indexOf('_confirmedSend={title:');
ok(iDecl>=0&&iGate>iDecl,'N40 `var _confirmedSend=null;` の宣言が _dateGate より前（巻き上げで凍結値が消えない）');
ok(iFreeze>iDecl,'N40b 凍結の代入は宣言より後');
// 照合は payload 生成（ensureTournamentId／syncTournamentToCloud）より前に置く。
var iDrift=RAW.indexOf('var _drift=_describeSendDrift();');
var iEnsure=RAW.indexOf('ensureTournamentId(state,master,getTournamentDateFromReport');
var iSync=RAW.indexOf('return syncTournamentToCloud(client,master,{clubId:clubId})');
ok(iDrift>=0&&iEnsure>iDrift&&iSync>iDrift,'N41 照合は ensureTournamentId / syncTournamentToCloud より前');
// 大会名だけでなく実施日も見る（#622 の確認にも同じ穴があるため片側だけ直さない）。
ok(/_describeSendDrift[\s\S]{0,900}nowTitle!==_confirmedSend\.title/.test(RAW),'N42 大会名の食い違いを見る');
ok(/_describeSendDrift[\s\S]{0,900}nowDate!==_confirmedSend\.date/.test(RAW),'N43 実施日の食い違いも見る（#622 の同型の穴）');
// snapshot の値で黙って送らない（運営者の編集を捨てない）。
var driftSrc=(RAW.match(/function _describeSendDrift\(\)\{[\s\S]*?\n    \}/)||[''])[0];
ok(driftSrc!==''&&driftSrc.indexOf('state.report.title=')<0&&driftSrc.indexOf('state.report.date=')<0,
   'N44 照合は state を書き戻さない（確認時の値で上書きして編集を捨てない）');

console.log('\nNUMAZU-BEHAVIOR-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
