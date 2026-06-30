#!/usr/bin/env node
// RESET-PP-REFRESH (bugfix): リセット後は過去参加者パネルを再描画し、
//   A/B「✓ 登録中」ハイライト（state.players 由来）がリセット前のまま残らないようにする。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
ok(/function resetAll\(\)\{[\s\S]*?renderPastParticipantsPanel\([\s\S]*?showResetUndoBanner\('大会データを全リセットしました'\)/.test(RAW),'R1 resetAll がリセット後に過去参加者パネルを再描画');
ok(/function resetTournamentProgressOnly\(\)\{[\s\S]*?renderPastParticipantsPanel\([\s\S]*?showResetUndoBanner\('大会進行データをリセットしました'\)/.test(RAW),'R2 resetProgress がリセット後に過去参加者パネルを再描画');
ok(/function undoLastReset\(\)\{[\s\S]*?renderPastParticipantsPanel/.test(RAW),'R3 undoLastReset も再描画（復元後の整合）');
console.log('RESET-PP-REFRESH: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
