#!/usr/bin/env node
// MEMBER-ATTR-SNAPSHOT-001 (#607) Phase 1-1/1-2: クラウド entries への当時値スナップショット＋読取フォールバック。
//   buildEntryAttrSnapshot(player)=当日 player 由来（現在マスタ不使用）／resolveEntryAttr(entry,memberCurrent)=当時値優先・null のみ現在値フォールバック。
//   静的: entries.push が _attr(player 由来) を使う・読取 SELECT/埋め込みに3列・migration に3列。実行: 純関数の GOLDEN。
var fs=require('fs');
var RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
function extractScripts(h){var s=[];var re=/<script[^>]*>([\s\S]*?)<\/script>/g;var m;while((m=re.exec(h))!==null)s.push(m[1]);return s.join('\n');}
var pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log('  FAIL: '+m);}}
function eq(a,b,m){ok(a===b,m+' → 期待「'+b+'」実際「'+a+'」');}

// ---- 静的アサート ----
ok(RAW.indexOf('var _attr=buildEntryAttrSnapshot(p);')>=0,'S1 送信は player(p) 由来のスナップショットを計算');
ok(RAW.indexOf('member_kind:_attr.member_kind, grade:_attr.grade, city:_attr.city')>=0,'S2 entries.push が _attr(当時値) を載せる');
ok(RAW.indexOf("select('final_rank,class,wins,losses,sos,sodos,member_kind,grade,city,player_id')")>=0,'S3 読取 SELECT に3列追加');
ok(RAW.indexOf('members(name,yomi,member_kind,grade,city)')>=0,'S4 members 埋め込みに現在値3列（フォールバック用）');
ok(/function buildEntryAttrSnapshot\(/.test(RAW),'S5 buildEntryAttrSnapshot 定義');
ok(/function resolveEntryAttr\(/.test(RAW),'S6 resolveEntryAttr 定義');
// 当時値=player 由来であることの構造保証（現在マスタ mm2/_cloudMemberFieldCols を entries に載せていない）
ok(RAW.indexOf('member_kind:fc2.member_kind, grade:fc2.grade, city:fc2.city')>=0 && RAW.indexOf('member_kind:_attr.member_kind')>=0,
   'S7 members は現在値(fc2)・entries は当時値(_attr) と源が分離');

// migration
var mig='';
try{ mig=fs.readFileSync(require('path').join(__dirname,'..','supabase','migrations','20260707120000_member_attr_snapshot_entries.sql'),'utf8'); }catch(e){}
ok(/add column if not exists member_kind text/.test(mig),'S8 migration: member_kind 列');
ok(/add column if not exists grade\s+text/.test(mig),'S9 migration: grade 列');
ok(/add column if not exists city\s+text/.test(mig),'S10 migration: city 列');

// ---- 実行: 純関数 GOLDEN ----
function loadEnv(){
  var js=extractScripts(RAW);
  var fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout','navigator',
    js+';return { buildEntryAttrSnapshot:buildEntryAttrSnapshot, resolveEntryAttr:resolveEntryAttr };');
  var noop=function(){};
  return fn({getElementById:function(){return null;},createElement:function(){return {style:{},appendChild:noop};},head:{},body:{},addEventListener:noop},
            {innerWidth:1024,addEventListener:noop},{getItem:function(){return null;},setItem:noop,removeItem:noop},
            {randomUUID:function(){return '0';}},noop,function(){return true;},function(){return '';},noop,noop,
            {createObjectURL:function(){return 'blob:mock';},revokeObjectURL:noop},{log:noop,warn:noop,error:noop},Promise,function(){return 0;},{});
}
var E=loadEnv();

// buildEntryAttrSnapshot: player 由来
var s1=E.buildEntryAttrSnapshot({member:'other',grade:'josei',city:'　沼津市　'});
eq(s1.member_kind,'other','E1 member_kind=player.member');
eq(s1.grade,'josei','E2 grade=player.grade');
eq(s1.city,'沼津市','E3 city=normalizeCity(player.city)');
var s2=E.buildEntryAttrSnapshot({});
eq(s2.member_kind,'member','E4 既定 member');
eq(s2.grade,'ippan','E5 既定 ippan');
eq(s2.city,'','E6 city 欠損→空（非 null＝旧行と区別可）');
// S3 核心: 現在マスタ(other/josei/三島市) ≠ 当日 player(member/ippan/沼津市) のとき player を採る
var pastPlayer={member:'member',grade:'ippan',city:'沼津市'};
var snap=E.buildEntryAttrSnapshot(pastPlayer);
ok(snap.member_kind==='member'&&snap.grade==='ippan'&&snap.city==='沼津市','E7 [GOLDEN] 当時値は player 固定（現在マスタに引きずられない）');

// resolveEntryAttr: 当時値優先・null のみ現在値フォールバック
var cur={member_kind:'other',grade:'josei',city:'三島市'};
var r1=E.resolveEntryAttr({member_kind:'member',grade:'ippan',city:'沼津市'}, cur);
ok(r1.member_kind.value==='member'&&r1.member_kind.fromCurrent===false,'E8 当時値あり→当時値・注記なし');
ok(r1.city.value==='沼津市'&&r1.city.fromCurrent===false,'E9 city 当時値優先');
var r2=E.resolveEntryAttr({member_kind:null,grade:null,city:null}, cur);
ok(r2.member_kind.value==='other'&&r2.member_kind.fromCurrent===true,'E10 旧行(null)→現在値＋注記');
ok(r2.city.value==='三島市'&&r2.city.fromCurrent===true,'E11 city も現在値フォールバック');
var r3=E.resolveEntryAttr({member_kind:'member',grade:'ippan',city:''}, cur);
ok(r3.city.value===''&&r3.city.fromCurrent===false,'E12 city 空文字は当時値扱い（フォールバックしない）');

console.log('MEMBER-ATTR-SNAPSHOT-CLOUD-607: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail>0?1:0);
