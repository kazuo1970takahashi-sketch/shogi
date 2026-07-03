#!/usr/bin/env node
// CLEANUP-P3-001: P3 小掃除3件の固定。
//   ① 名簿タブの旧サマリ「登録: N名（うちふりがな未入力: N名）」撤去（MASTER-SHEET-002 の
//      シートヘッダサマリ「名簿 N名（ふりがな未入力 N名）」と重複＝?v=61 P3 申し送り）。
//   ② 削除日セルの生値 title 付与（最終参加セルと対称＝?v=61 P3 申し送り）。
//   ③ マスタ書き出し成功通知の alert → showToast（NOTIFY-N2 第2スライス・#476 L3 申し送り・
//      STYLE-GUIDE N2=成功は toast）。失敗系 showMsg('err') は不変。
//   ④ pullMembersFromCloud の stale コメント追従（select 明示列挙 → '*'）。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

// ① 旧サマリ撤去
ok(RAW.indexOf("'登録: <strong>'")<0,'C1 旧サマリ「登録: <strong>N名」を出力しない');
ok(RAW.indexOf('master-no-yomi-summary')<0,'C2 旧サマリ span(master-no-yomi-summary) を出力しない');
ok(RAW.indexOf("名簿 '+liveMembers.length+'名'")>=0,'C3 シートヘッダサマリ「名簿 N名」は維持');
ok(RAW.indexOf('ふりがな未入力 ')>=0,'C4 ヘッダサマリのふりがな未入力件数は維持');
ok(/var noYomiCount=0;/.test(RAW),'C5 noYomiCount 算出はヘッダサマリ用に維持');

// ② 削除日 title 対称
var delCell=RAW.indexOf('>削除:');
ok(delCell>=0,'C6 削除日セルは存在');
var delLineStart=RAW.lastIndexOf('\n',delCell);
var delLine=RAW.slice(delLineStart,delCell+30);
ok(/title="'\+escapeHtml\(m\.deleted_at\|\|''\)\+'"/.test(delLine),'C7 削除日セルに生値 title（escapeHtml 経由）');
ok(/title="'\+escapeHtml\(m\.last_attended\|\|''\)\+'"/.test(RAW),'C8 最終参加セルの生値 title は不変');

// ③ 書き出し成功 alert → toast
var expPos=RAW.indexOf("getElementById('masterExportBtn')");
ok(expPos>=0,'C9 masterExportBtn の bind は存在');
var expBlock=RAW.slice(expPos,expPos+1600);
ok(expBlock.indexOf("showToast(filename+' に保存しました')")>=0,'C10 書き出し成功は showToast');
ok(expBlock.indexOf('alert(')<0,'C11 書き出し handler 内に成功 alert が残っていない');
ok((expBlock.match(/showMsg\('マスタの書き出しに失敗しました','err'\)/g)||[]).length===2,'C12 失敗系 showMsg 2箇所は不変');

// ④ stale コメント追従
ok(RAW.indexOf("select('member_id,name,yomi,branch,deleted_at')")<0,'C13 旧の明示列挙コメントが残っていない');
ok(RAW.indexOf("members').select('*').eq('club_id',clubId)")>=0,'C14 実装は select(*) のまま不変');

console.log('CLEANUP-P3-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
