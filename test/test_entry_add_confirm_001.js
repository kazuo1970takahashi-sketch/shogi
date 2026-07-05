#!/usr/bin/env node
// ENTRY-ADD-CONFIRM-001 (#599): 受付サジェストの「タップ即登録」廃止の単体テスト（ソース検証）。
//   観点:
//     EAC-REMOVE  サジェスト行の A/B 直接追加経路（suggest-add-btn 生成・handleSuggestClassAdd）が存在しない。
//     EAC-SELECT  行タップ＝選択（onSuggestTap が氏名/ふりがなを入力欄へ反映）は維持されている。
//     EAC-CONFIRM 確定導線＝既存 addPlayer（_suggestState 経由の member_id 引き継ぎ）が維持されている。
//     EAC-SCOPE   過去参加者パネル側の A/B 追加（handlePastParticipantClassAdd・confirm 付き）はスコープ外＝無改変で残る。
//   完全架空データのみ・runtime（shogi_v4.html）以外は無改変。

const fs=require('fs');
const targetPath=process.argv[2];
if(!targetPath){console.error('Usage: node test_entry_add_confirm_001.js <html>');process.exit(1);}
const RAW=fs.readFileSync(targetPath,'utf8');
function extractScripts(html){const s=[];const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m;while((m=re.exec(html))!==null)s.push(m[1]);return s.join('\n');}
const SRC=extractScripts(RAW);

let pass=0, fail=0;
function ok(m){pass++; if(process.env.VERBOSE)console.log('  ✓ '+m);}
function ng(m){fail++; console.error('  ✗ '+m);}
function assert(c,m){if(c)ok(m);else ng(m);}

// EAC-REMOVE: A/B 直接追加経路の不在
assert(SRC.indexOf("function handleSuggestClassAdd")===-1,'EAC-REMOVE-1 handleSuggestClassAdd 関数定義が存在しない');
assert(SRC.indexOf("handleSuggestClassAdd(m.id,cls)")===-1,'EAC-REMOVE-2 サジェスト行から handleSuggestClassAdd 呼び出しが存在しない');
assert(SRC.indexOf("btn.className='suggest-add-btn'")===-1,'EAC-REMOVE-3 suggest-add-btn ボタン生成コードが存在しない');
assert((SRC.match(/ENTRY-ADD-CONFIRM-001/g)||[]).length>=2,'EAC-REMOVE-4 ENTRY-ADD-CONFIRM-001 マーカーが残っている');

// EAC-SELECT: タップ＝選択の維持
assert(SRC.indexOf("function onSuggestTap(member){")>=0,'EAC-SELECT-1 onSuggestTap が存在する');
assert(SRC.indexOf("if(inpName)inpName.value=member.name||'';")>=0,'EAC-SELECT-2 onSuggestTap が氏名を入力欄へ反映する');
assert(SRC.indexOf("if(inpYomi)inpYomi.value=member.yomi||'';")>=0,'EAC-SELECT-3 onSuggestTap がふりがなを入力欄へ反映する');
assert(SRC.indexOf("_suggestState.selectedMemberId=member.id;")>=0,'EAC-SELECT-4 onSuggestTap が選択 member を保持する');
assert((SRC.match(/onSuggestTap\(m\);/g)||[]).length>=2,'EAC-SELECT-5 行タップ（mousedown/touchstart）が onSuggestTap に結線されている');

// EAC-CONFIRM: 確定は既存 addPlayer（「追加」ボタン）
assert(SRC.indexOf("function addPlayer(){")>=0,'EAC-CONFIRM-1 addPlayer が存在する');
assert(SRC.indexOf("if(master.members[mi].id===_suggestState.selectedMemberId){sel=master.members[mi];break;}")>=0,'EAC-CONFIRM-2 addPlayer が _suggestState 経由で member_id を引き継ぐ');

// EAC-SCOPE: 過去参加者パネル側は無改変で残る
assert(SRC.indexOf("function handlePastParticipantClassAdd(memberId,cls){")>=0,'EAC-SCOPE-1 過去参加者パネルの A/B 追加は残る');
assert(SRC.indexOf("さんを '+cls+'クラス に追加しますか?")>=0,'EAC-SCOPE-2 過去参加者パネルの追加 confirm は残る');

console.log('ENTRY-ADD-CONFIRM-001: pass='+pass+' fail='+fail);
process.exit(fail>0?1:0);
