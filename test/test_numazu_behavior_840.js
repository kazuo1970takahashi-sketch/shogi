#!/usr/bin/env node
// @suite: NUMAZU-BEHAVIOR-001（#840）沼津固有の「挙動」2箇所を外す
// NUMAZU-BEHAVIOR-001（Issue #840・作者決定 2026-08-11）
//   ① 大会名に「月例」が入っていたら表示だけ無条件で沼津の名前に置換する挙動を撤去
//   ② 個人情報の同意文が「沼津支部内の大会運営目的で」と言い切っている問題を解消
//
//   ★ この便のスコープは `shogi_v4.html` のみ。`app/auth.js`（管理者画面側の二重実装）は
//     **リリース列車が配信する5ファイルに含まれない**（v136 の実 diff で index.html /
//     shogi_v4.html / sw.js の3ファイルだけを実測）ため直しても本番に届かない。別便で扱う。
//     したがって `test_cloud_tourney_naming_app_608.js` / `test_app_ux_004c.js` /
//     `test_stageb_read.js` は**従来の期待値のまま緑**であるのが正しい（app/auth.js 経路の番人）。
//
//   ★ 受け入れ基準1 は allowlist 実装を弾くために複数の実例で確かめる
//     （パネルが「`松本` を含むときだけ素通しする12行の allowlist」で初版の全基準を緑にした実演済み）。
//
//   入力は完全架空。shogi_v4.html は読むだけ。

const fs = require('fs');
const path = require('path');

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_numazu_behavior_840.js <html>'); process.exit(1); }
const ABS = path.resolve(targetPath);
const RAW = fs.readFileSync(ABS,'utf8');

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
              buildMasterTabHtml:(typeof buildMasterTabHtml==='function')?buildMasterTabHtml:null,
              factoryReport:factoryReport, CLUB_PROFILE_KEY:CLUB_PROFILE_KEY,
              localStorage:localStorage, state:state };`);
  return fn(doc, win, ls, {randomUUID(){return '0';}}, function(){}, function(){return true;}, function(){return '';},
    function(){}, function(){return null;}, {createObjectURL(){return 'b';},revokeObjectURL(){}}, console, Promise, function(){return 0;});
}

const env = loadEnv();
const C = env.canonicalizeCloudTournamentName;

console.log('\n[A] 受け入れ基準1: 他クラブの大会名がそのまま返る（allowlist 実装を弾く）');
(function(){
  eq(C('松本支部月例将棋大会'), '松本支部月例将棋大会', 'A-1 松本支部月例将棋大会');
  eq(C('〇〇将棋クラブ月例会'), '〇〇将棋クラブ月例会', 'A-2 〇〇将棋クラブ月例会');
  eq(C('高崎こども将棋クラブ 月例戦'), '高崎こども将棋クラブ 月例戦', 'A-3 高崎こども将棋クラブ 月例戦');
  eq(C('MATSUMOTO月例CUP'), 'MATSUMOTO月例CUP', 'A-4 MATSUMOTO月例CUP');
  eq(C('日本将棋連盟松本支部 月例大会'), '日本将棋連盟松本支部 月例大会', 'A-5 日本将棋連盟松本支部 月例大会');
  eq(C('六月例会'), '六月例会', 'A-6 六月例会（部分一致の誤爆が消えた）');
  eq(C('松本支部将棋大会'), '松本支部将棋大会', 'A-7 対照: 月例を含まない名前は従来どおりそのまま');
  // 「月例」を含むどの入力でも沼津へ倒れないことを、実装の形に依存せず確認する
  var samples=['松本支部月例将棋大会','〇〇将棋クラブ月例会','高崎こども将棋クラブ 月例戦','MATSUMOTO月例CUP','六月例会','月例将棋大会','A月例B'];
  var toNumazu=samples.filter(function(x){ return C(x).indexOf('沼津')>=0; });
  assert(toNumazu.length===0, 'A-8 「月例」を含む7例のいずれも沼津へ集約されない（実測 '+JSON.stringify(toNumazu)+'）');
})();

console.log('\n[B] 受け入れ基準3: 報告書除去・日付サフィックス除去は維持');
(function(){
  eq(C('○○杯 報告書'), '○○杯', 'B-1 末尾「報告書」除去');
  eq(C('○○杯2026-04'), '○○杯', 'B-2 日付サフィックス除去');
  eq(C('○○杯（2026-04）'), '○○杯', 'B-3 全角括弧の日付サフィックス除去');
  eq(C('支部対抗戦2025'), '支部対抗戦2025', 'B-4 年号だけの末尾は温存（従来どおり）');
  eq(C('松本支部月例将棋大会 報告書'), '松本支部月例将棋大会', 'B-5 他クラブ名でも報告書除去は効く');
})();

console.log('\n[C] 受け入れ基準2: 空のときの既定はクラブ設定から取る（作者決定 2026-08-11）');
(function(){
  const ls = env.localStorage;
  ls.removeItem(env.CLUB_PROFILE_KEY);
  eq(C(''), env.factoryReport().title, 'C-1 クラブ設定が無ければ factory の大会名へ fail-soft');
  eq(C('   '), env.factoryReport().title, 'C-2 空白のみも同じ');
  eq(C('報告書'), env.factoryReport().title, 'C-3 除去した結果が空になる場合も同じ');

  ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:1,report:{title:'松本支部月例将棋大会'}}));
  eq(C(''), '松本支部月例将棋大会', 'C-4 クラブ設定があればその大会名を既定にする');
  eq(env.defaultCloudTournamentTitle(), '松本支部月例将棋大会', 'C-5 defaultCloudTournamentTitle 単体でも同じ');

  ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:1,report:{title:'   '}}));
  eq(C(''), env.factoryReport().title, 'C-6 クラブ設定の大会名が空白のみなら factory へ');

  ls.setItem(env.CLUB_PROFILE_KEY, '{壊れた JSON');
  eq(C(''), env.factoryReport().title, 'C-7 壊れた club_profile でも例外を投げず factory へ（fail-soft）');

  ls.setItem(env.CLUB_PROFILE_KEY, JSON.stringify({schema_version:99,report:{title:'乗っ取り'}}));
  eq(C(''), env.factoryReport().title, 'C-8 schema_version 不一致は採用しない（sanitize 経由）');
  ls.removeItem(env.CLUB_PROFILE_KEY);
})();

console.log('\n[D] 受け入れ基準7: 月度プレフィックスの合成は不変');
(function(){
  eq(env.buildCloudTournamentDisplayTitle('松本支部月例将棋大会','2026-04-15'), '2026年4月度 松本支部月例将棋大会', 'D-1 他クラブ名に月度が付く');
  eq(env.buildCloudTournamentDisplayTitle('月例将棋大会2026-04','2026-04-15'), '2026年4月度 月例将棋大会', 'D-2 日付除去後に月度が付く');
  eq(env.buildCloudTournamentDisplayTitle('2026年4月度 ○○杯','2026-04-15'), '2026年4月度 ○○杯', 'D-3 二重付与ガードは従来どおり');
  eq(env.buildCloudTournamentDisplayTitle('○○杯',''), '○○杯', 'D-4 日付欠損時は月度を付けない（fail-soft）');
})();

console.log('\n[E] 受け入れ基準4: 同意文に沼津固有の主体が残らない');
(function(){
  const st = env.state;
  st.report = env.factoryReport();
  st.report.organizer = '日本将棋連盟松本支部';
  eq(env.buildMasterConsentPurposeText(),
    '本ツールは、日本将棋連盟松本支部の大会運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。',
    'E-1 主催者名が入っていればそれを主体にする');

  st.report.organizer = '';
  eq(env.buildMasterConsentPurposeText(),
    '本ツールは、この端末で運営する大会の運営目的で、過去参加者の氏名・参加履歴をこの端末内に保存します。',
    'E-2 主催者が未設定なら主体を特定しない文面（literal で固定）');

  st.report.organizer = '   ';
  assert(env.buildMasterConsentPurposeText().indexOf('この端末で運営する大会')>=0, 'E-3 空白のみも未設定扱い');

  st.report.organizer = '<script>x</script>将棋会';
  assert(env.buildMasterConsentPurposeText().indexOf('<script>')<0, 'E-4 主催者名は escapeHtml を通る（innerHTML に入るため）');

  st.report = env.factoryReport();
  assert(env.buildMasterConsentPurposeText().indexOf('沼津支部内の大会運営目的')<0,
    'E-5 旧文言「沼津支部内の大会運営目的」は残っていない');
  assert(RAW.indexOf('本ツールは沼津支部内の大会運営目的で')<0,
    'E-6 ソースにも旧文言のリテラルが残っていない');
  // factory（沼津）の端末では主催者名が入っているので意味は保たれる
  assert(env.buildMasterConsentPurposeText().indexOf('日本将棋連盟沼津支部の大会運営目的')>=0,
    'E-7 沼津の端末では従来と同じ意味の文面になる（主催者名 = 日本将棋連盟沼津支部）');
})();

console.log('\n[F] スコープの固定');
(function(){
  assert(RAW.indexOf("s.indexOf('月例')>=0")<0, 'F-1 shogi_v4.html から月例集約の分岐が消えている');
  const numazuLiterals=(RAW.match(/沼津支部月例将棋大会/g)||[]).length;
  assert(numazuLiterals>=1, 'F-2 factoryReport の沼津既定は残っている（実測 '+numazuLiterals+' 箇所・CLUB-PROFILE-001 の一本化）');
  assert(/function defaultCloudTournamentTitle\(\)/.test(RAW), 'F-3 既定の取得は関数に切り出されている');
  assert(/readClubProfileRaw\(\)/.test(RAW.slice(RAW.indexOf('function defaultCloudTournamentTitle'))), 'F-4 既定はクラブ設定を読む');
})();

console.log('\n  NUMAZU-BEHAVIOR-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
