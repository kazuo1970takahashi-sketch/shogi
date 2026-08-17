#!/usr/bin/env node
// INDEX-ONBOARD-001 (#841): index.html の「他のクラブ・支部の方へ」導入導線のピン。
//
// 何を守るか:
//   A. 導線そのもの（新カード・アンカー・副題の可読性・適用範囲の注記）が消えたら FAIL。
//   B. 「今できること／今できないこと」の各項目が、**書いた当時のコード事実**とずれたら FAIL。
//   C. 作者決定（2026-08-09）「問い合わせ窓口は設けない」＝メールアドレスを載せない。
//
// ★ B の書き方について（2026-08-17 の反証パネルの指摘を受けた設計変更・重要）:
//   初版は `/function\s+resetAll\s*\(/` のように **関数や文字列の「存在」だけ**を見ていた。
//   これは腐り対策として機能しない。実際、初版は
//     ・項目1「全リセットで沼津の値に戻る」→ #845/#864 (CLUB-PROFILE-001/002) で**保持されるよう直っていた**
//     ・項目5「奇数のまま部分開始すると1回戦を確定できない」→ #835 (FIRSTROUND-ODD-001) で**直っていた**
//   の2件を **PASS=36/FAIL=0 のまま素通しした**（サイトが「できない」と嘘を書く状態）。
//   よってここでは **文言が依存している「振る舞いの側」をピンする**。
//   コード側が変わったらこのテストが赤くなり、サイトの文言更新が強制される。
//
// 実データ不使用・読み取り専用。docs/ と app/ と supabase/ は index.html と同じ repo 直下を見る。
const fs = require('fs');
const path = require('path');
const target = process.argv[2] || 'shogi_v4.html';
const root = path.dirname(path.resolve(target));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

function readOrNull(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; }
}

const IDX = readOrNull('index.html');
ok(IDX !== null, 'A0 index.html を読めること');
if (IDX === null) { console.log('INDEX-ONBOARD-001: PASS=' + pass + ', FAIL=' + fail); process.exit(1); }
const APP = readOrNull('shogi_v4.html') || fs.readFileSync(path.resolve(target), 'utf8');

// 「今できること」節 / 「今できないこと」節をそれぞれ切り出す（項目の混同を防ぐ）。
const iCan = IDX.indexOf('今できること');
const iCant = IDX.indexOf('今できないこと');
const iWarr = IDX.indexOf('保証していないこと');
ok(iCan > 0 && iCant > iCan && iWarr > iCant, 'A0b 3節がこの順で存在する');
const CAN = IDX.slice(iCan, iCant);
const CANT = IDX.slice(iCant, iWarr);

// ---- A. 導線そのもの ---------------------------------------------------------

ok(/はじめての方へ（他のクラブ・支部の方）/.test(IDX),
   'A1 新カードの見出し「はじめての方へ（他のクラブ・支部の方）」がある');
ok(/id="for-other-clubs"/.test(IDX), 'A2 新カードに id="for-other-clubs" がある');
ok(/href="#for-other-clubs"/.test(IDX), 'A3 #for-other-clubs へのアンカーがある');
ok(IDX.indexOf('href="#for-other-clubs"') < IDX.indexOf('id="for-other-clubs"'),
   'A4 アンカーは着地点より前にある');

// アンカーで飛んだあと、フォーカスとスクリーンリーダーのカーソルがセクション本体へ移るように。
//   実ブラウザ班の実測: このカードより後ろにフォーカス可能要素が1つも無いため、tabindex が無いと
//   飛んだ直後の Tab がページ先頭のリンクへ戻り、読み位置が失われる。
ok(/id="for-other-clubs"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="for-other-clubs"/.test(IDX),
   'A5 着地点に tabindex="-1" がある（飛んだ後にフォーカスがページ先頭へ戻らないため）');

// 副題に「他のクラブ・支部の方もお使いいただけます」を載せた以上、可読性の修正は必須。
//   汎用 p{color:#333} が .header{color:#fff} の継承を上書きしていた（紺地に濃灰＝実測 1.07:1）。
ok(/\.header\s+p\s*\{[^}]*color\s*:\s*#fff/i.test(IDX),
   'A6 .header p に color:#fff が明示されている（副題のコントラスト・従来からの不具合の修正）');
ok(/他のクラブ・支部の方もお使いいただけます/.test(IDX),
   'A7 ヘッダ副題に「他のクラブ・支部の方もお使いいただけます」がある');

['今できること', '今できないこと', '保証していないこと', '試すときのおすすめ'].forEach(function (h, i) {
  ok(IDX.indexOf(h) !== -1, 'A8-' + (i + 1) + ' 見出し「' + h + '」がある');
});

// 沼津固有カード直前の「ここから下は当てはまりません」注記。他クラブの方が読み飛ばすと
// 参加費表を自分たちのものと誤読するので、AA を満たす色でなければならない。
const scopeNote = /ここから下は沼津支部の運営情報です[^<]*<\/p>/.test(IDX);
ok(scopeNote, 'A9 沼津固有カードの前に適用範囲の注記がある');
const scopeLine = (IDX.match(/<p[^>]*>ここから下は沼津支部の運営情報です/) || [''])[0];
ok(scopeLine !== '' && !/#888/.test(scopeLine),
   'A10 適用範囲の注記に #888（3.54:1・AA不合格）を使っていない（実測: ' + scopeLine.slice(0, 60) + '）');

// ---- B. 各項目 ⇔ コード事実 --------------------------------------------------
// ★ 各 B*b は「振る舞いの側」を見る。壊れたら＝サイトの文言が嘘になった合図。

// B1 クラブ既定（#845/#864 CLUB-PROFILE-001/002）＝「今できること」側
ok(/クラブの既定/.test(CAN) && /💾 この設定をクラブの既定として保存/.test(CAN),
   'B1a 「今できること」にクラブ既定の保存が書かれている');
ok(!/沼津支部の値に戻ります/.test(CANT),
   'B1b 「今できないこと」に旧記述「沼津支部の値に戻ります」が残っていない' +
   '（#845/#864 で保持されるよう直っている）');
ok(APP.indexOf('クラブ既定（大会名・会場・クラス構成など）は保持されます') !== -1,
   'B1c ★振る舞いのピン: resetAll の確認文が「クラブ既定は保持されます」と言っている' +
   '（この文が消えたら＝保持しなくなったら、index.html の記述を書き直すこと）');
ok(APP.indexOf('💾 この設定をクラブの既定として保存') !== -1,
   'B1d ★振る舞いのピン: 保存ボタンが実在する（消えたら記述を書き直すこと）');
ok(/function\s+profileClasses\s*\(/.test(APP) && /function\s+profileReport\s*\(/.test(APP),
   'B1e ★振る舞いのピン: resetAll が既定を profile から構築する関数が健在');

// B2 参加費は変えられない（getFee ハードコード・設定に載らない）
ok(/参加費の金額は変えられません/.test(CANT), 'B2a 項目「参加費の金額は変えられません」がある');
ok(/function\s+getFee\s*\(/.test(APP), 'B2b 根拠: getFee がある');
const cprk = (APP.match(/var\s+CLUB_PROFILE_REPORT_KEYS\s*=\s*\[[^\]]*\]/) || [''])[0];
ok(cprk !== '' && !/fee/i.test(cprk),
   'B2c ★振る舞いのピン: クラブ既定の保存対象に参加費キーが無い' +
   '（入ったら「変えられません」が嘘になる。実測: ' + cprk.slice(0, 80) + '）');

// B3 クラウド系は現在この1クラブ専用（最重要）
ok(/現在この1クラブ専用/.test(CANT), 'B3a 項目3が「現在この1クラブ専用」と書いている');
ok(/アカウントを作る仕組みが、?\s*まだアプリにありません/.test(CANT),
   'B3b 項目3が「アカウントを作る仕組みがまだアプリにない」と書いている');
// ログイン自体は通る＝「ログイン画面までしか進めない」とは書かない（実挙動は送信時に止まる）
ok(/送信先クラブを一意に特定できません/.test(CANT),
   'B3c 項目3が実挙動（送信時のメッセージ）を引用している');
ok(APP.indexOf('送信先クラブを一意に特定できません') !== -1,
   'B3d ★振る舞いのピン: そのメッセージが shogi_v4.html に実在する');

const AUTH = readOrNull('app/auth.js');
ok(AUTH !== null, 'B3e 根拠ファイル app/auth.js を読めること');
ok(AUTH !== null && /幹事登録がありません/.test(AUTH),
   'B3f ★振る舞いのピン: app/auth.js に未登録メールの行き止まり文がある' +
   '（消えたら新規クラブの導線が入った可能性＝項目3を見直すこと）');
ok(AUTH !== null && AUTH.indexOf("from('clubs')") === -1 && AUTH.indexOf('from("clubs")') === -1,
   'B3g ★振る舞いのピン: app/auth.js が clubs テーブルを直接触っていない');

const SEED = readOrNull('supabase/seed.example.sql');
ok(SEED !== null, 'B3h 根拠ファイル supabase/seed.example.sql を読めること');
ok(SEED !== null && /insert\s+into\s+public\.clubs/i.test(SEED),
   'B3i ★振る舞いのピン: clubs 行は seed の直接 SQL でしか作られない');

// 📱 スマホ星取表の但し書き（実体は「同じ端末の別タブ」＝参加者配信の代替ではない）
ok(/スマホ星取表/.test(CANT) && /同じ端末の別タブ/.test(CANT) && /インターネット不要/.test(CANT),
   'B3j 但し書きが「同じ端末の別タブ」と明記している（参加者向け配信の代替と誤読させない）');
ok(/mobile-standings/.test(APP), 'B3k 根拠: mobile-standings 経路が実在する');

// B4 「沼津支部」の表示が残る＋会員区分の語彙も固定
ok(/画面の一部に「沼津支部」の表示が残ります/.test(CANT), 'B4a 項目4がある');
ok(/支部員／支部員以外/.test(CANT), 'B4b 項目4が会員区分の語彙固定にも触れている');
ok(APP.indexOf('沼津支部員') !== -1,
   'B4c ★振る舞いのピン: memberKindLabelJa の「沼津支部員」が実在する' +
   '（改名 UI が入って消えたら記述を見直すこと）');

// B5 クラブ既定は端末ごと
ok(/この端末のブラウザの中だけ/.test(CANT), 'B5a 「クラブ既定は端末ごと」の項目がある');
ok(/shogi_club_profile/.test(APP),
   'B5b ★振る舞いのピン: クラブ既定の保存先が localStorage キーである');

// B6 A・Bクラスは削除できない
ok(/A・Bクラスは削除できません/.test(CANT), 'B6a 項目がある');
ok(APP.indexOf('A・Bクラスはアプリの既定クラスのため削除できません。') !== -1,
   'B6b ★振る舞いのピン: canDeleteClass の builtin ガード文言が実在する');

// B7 空欄にすると既定が復活（空欄可は3キーだけ）
ok(/空欄のままにすると、沼津支部の既定値が入ります/.test(CANT), 'B7a 項目がある');
const emptyable = (APP.match(/var\s+CLUB_PROFILE_EMPTYABLE_KEYS\s*=\s*\[[^\]]*\]/) || [''])[0];
ok(/fax/.test(emptyable) && /officeName/.test(emptyable) && /accountingNote/.test(emptyable) &&
   (emptyable.match(/'/g) || []).length === 6,
   'B7b ★振る舞いのピン: 空欄可は fax / officeName / accountingNote の3キーだけ' +
   '（増減したら記述を書き直すこと。実測: ' + emptyable + '）');

// B8 奇数クラス＝「今できること」側（#835 FIRSTROUND-ODD-001）
ok(/人数が奇数のクラスも、そのまま始められます/.test(CAN),
   'B8a 「今できること」に奇数クラスが書かれている');
ok(!/1回戦を確定できなくなります/.test(CANT),
   'B8b 「今できないこと」に旧記述「1回戦を確定できなくなります」が残っていない（#835 で解決済み）');
ok(APP.indexOf('FIRSTROUND-ODD-001') !== -1,
   'B8c ★振る舞いのピン: FIRSTROUND-ODD-001 の統一確定条件が健在' +
   '（巻き戻ったら「今できること」から外すこと）');
ok(/部分開始/.test(APP), 'B8d 根拠: 「部分開始」が実在する');

// B9 回戦数は 3〜7
ok(/3〜7/.test(CAN), 'B9a 「今できること」が回戦数の範囲 3〜7 を書いている');
ok(/var\s+nums\s*=\s*\[3,\s*4,\s*5,\s*6,\s*7\]/.test(APP),
   'B9b ★振る舞いのピン: 回戦数の選択肢が [3,4,5,6,7]（変わったら記述を書き直すこと）');

// B10 📥 まとめて登録は会員名簿に書かない（同一ファイル内の自己矛盾を防ぐ）
ok(/「📥 まとめて登録」だけでは会員名簿には入りません/.test(IDX),
   'B10a 「試すときのおすすめ」が 📥 だけでは名簿に入らないと明記している');
ok(/📋 参加者を名簿に反映/.test(IDX), 'B10b 名簿へ入れる正しい経路を案内している');
ok(APP.indexOf('ここで登録した参加者は名簿（会員名簿）には登録されません。') !== -1,
   'B10c ★振る舞いのピン: アプリ側も「名簿には登録されません」と言っている');
ok(APP.indexOf('📋 参加者を名簿に反映') !== -1, 'B10d 根拠: 反映ボタンが実在する');

// ---- C. 作者決定: 問い合わせ窓口は設けない -----------------------------------

const mails = IDX.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
ok(mails.length === 0,
   'C1 index.html にメールアドレスを載せていない（作者決定 2026-08-09・収集ロボット対策）' +
   '（検出: ' + mails.join('・') + '）');
ok(!/ご相談ください/.test(IDX),
   'C2 「ご相談ください」で終わらせていない（窓口が無いため・作者決定 2026-08-17）');

// ---- D. 沼津固有の集約 --------------------------------------------------------

ok(/沼津支部 月例将棋大会について/.test(IDX), 'D1 沼津固有をまとめたカードの見出しがある');
ok(IDX.indexOf('id="for-other-clubs"') < IDX.indexOf('沼津支部 月例将棋大会について'),
   'D2 沼津固有カードは「はじめての方へ」より後ろにある');

// ---- E. 触っていないことのピン ------------------------------------------------

ok(/shogi_v4\.html\?v=\d+/.test(IDX), 'E1 アプリへの導線 shogi_v4.html?v=N が残っている');
['docs/install_guide.html', 'docs/manual_sp.html', 'docs/manual_print.html'].forEach(function (h, i) {
  ok(IDX.indexOf(h) !== -1, 'E2-' + (i + 1) + ' 既存の導線 ' + h + ' が残っている');
});

console.log('INDEX-ONBOARD-001: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
