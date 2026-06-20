#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2-STAGE-A: Supabase スキーマ＋RLS の静的検証（live DB 不要）。
//   正本: ai-requests/2026-06-20_data-persistence-CONFIRMED-spec.md §2 / 更新3 RLS 最低ライン
//   設計: docs/specs/20260620_data_persistence_phase2_stagea_design.md
//   目的: SQL マイグレーションが「必須テーブル/club_id/RLS 有効化/必須ポリシーの条件の形/
//     ヘルパ関数/最後の admin ガード/secret 非混入/実データ(seed) 非混入」を満たすことを固定する。
//   注意: これは静的検証（文字列レベル）。RLS の実効（未ログイン/別club/retired/氏名/publishable
//     単体拒否）は live Supabase で検証する（prereq 完了後）。本テストはポリシーの存在と条件式の
//     形を退行から守るための回帰テストであり、live 検証の代替ではない。
//   引数の TARGET(shogi_v4.html) は使わない（SQL ファイルを直接読む）。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'supabase/migrations/20260620120000_stagea_schema.sql');
const RLS    = path.join(ROOT, 'supabase/migrations/20260620120100_stagea_rls.sql');
const README = path.join(ROOT, 'supabase/README.md');

function read(p){ try { return fs.readFileSync(p, 'utf8'); } catch(e){ return null; } }
const schema = read(SCHEMA);
const rls    = read(RLS);
const readme = read(README);
const allSql = (schema || '') + '\n' + (rls || '');

let pass=0, fail=0;
function ok(msg){pass++; if(process.env.VERBOSE)console.log('  ✓ '+msg);}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(msg);else ng(msg);}

// 文字列ヘルパ（大文字小文字を無視した包含）
function has(hay, needle){ return hay.toLowerCase().indexOf(String(needle).toLowerCase()) >= 0; }
function reHas(hay, re){ return re.test(hay); }

// ============================================================
// FILES. ファイルが存在し非空。
// ============================================================
assert(schema && schema.length>200, 'FILE1 schema migration が存在し非空');
assert(rls && rls.length>200, 'FILE2 rls migration が存在し非空');
assert(readme && readme.length>100, 'FILE3 supabase/README が存在し非空');

// ============================================================
// SCHEMA. 6テーブル定義・club_id・unique(tournament_id, player_id)・氏名は members のみ。
// ============================================================
const TABLES = ['clubs','organizers','members','players','tournaments','entries'];
TABLES.forEach(function(t){
  assert(reHas(schema||'', new RegExp('create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.'+t+'\\b','i')),
    'SCHEMA-tbl 「'+t+'」テーブルが定義される');
});
// clubs 以外の5テーブルは club_id を持つ（多テナント分離）
['organizers','members','players','tournaments','entries'].forEach(function(t){
  // 当該 create table ブロックを粗く切り出して club_id を確認
  const m = (schema||'').match(new RegExp('create\\s+table[^;]*public\\.'+t+'\\b[\\s\\S]*?\\);','i'));
  assert(!!m && /club_id\s+uuid\s+not\s+null/i.test(m[0]), 'SCHEMA-club 「'+t+'」に club_id uuid not null がある');
});
assert(reHas(schema||'', /unique\s*\(\s*tournament_id\s*,\s*player_id\s*\)/i), 'SCHEMA-uniq entries に unique(tournament_id, player_id)');
// 氏名(name)は members だけ（players/entries/tournaments の列定義に氏名カラムを置かない）
{
  const memBlock = (schema||'').match(/create\s+table[^;]*public\.members\b[\s\S]*?\);/i);
  assert(!!memBlock && /\bname\s+text\s+not\s+null/i.test(memBlock[0]), 'SCHEMA-name members に name（氏名）がある');
  const playersBlock = (schema||'').match(/create\s+table[^;]*public\.players\b[\s\S]*?\);/i);
  assert(!!playersBlock && !/\bname\s+text/i.test(playersBlock[0]), 'SCHEMA-name2 players は氏名(name)カラムを持たない（member_id 参照のみ）');
  const entriesBlock = (schema||'').match(/create\s+table[^;]*public\.entries\b[\s\S]*?\);/i);
  assert(!!entriesBlock && !/\bname\s+text/i.test(entriesBlock[0]), 'SCHEMA-name3 entries は氏名(name)カラムを持たない');
}

// ============================================================
// RLS. 全6テーブルで enable row level security。force も付与。
// ============================================================
TABLES.forEach(function(t){
  assert(reHas(rls||'', new RegExp('alter\\s+table\\s+public\\.'+t+'\\s+enable\\s+row\\s+level\\s+security','i')),
    'RLS-enable 「'+t+'」で RLS 有効化');
});
TABLES.forEach(function(t){
  assert(reHas(rls||'', new RegExp('alter\\s+table\\s+public\\.'+t+'\\s+force\\s+row\\s+level\\s+security','i')),
    'RLS-force 「'+t+'」で force RLS（所有者にも適用）');
});

// ============================================================
// HELPERS. 再帰回避のヘルパ関数（security definer・search_path 固定）。
// ============================================================
['app_role_rank','app_is_active_organizer','app_my_club_id','app_my_org_rank'].forEach(function(fn){
  assert(reHas(rls||'', new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.'+fn+'\\b','i')),
    'HELPER 「'+fn+'」関数が定義される');
});
// active 判定/club/rank ヘルパは security definer かつ search_path 固定
['app_is_active_organizer','app_my_club_id','app_my_org_rank'].forEach(function(fn){
  const m = (rls||'').match(new RegExp('function\\s+public\\.'+fn+'[\\s\\S]*?\\$\\$;','i'));
  assert(!!m && /security\s+definer/i.test(m[0]) && /set\s+search_path\s*=\s*public/i.test(m[0]),
    'HELPER-def 「'+fn+'」は security definer ＋ search_path=public 固定');
});

// ============================================================
// POLICY: members（氏名）read は organizer 以上(rank>=1)。
// ============================================================
{
  const m = (rls||'').match(/create\s+policy\s+members_select[\s\S]*?;/i);
  assert(!!m, 'POL-members members の select ポリシーがある');
  assert(!!m && /app_my_org_rank\(\)\s*>=\s*1/i.test(m[0]) && /app_my_club_id\(\)/i.test(m[0]),
    'POL-members-rank members read は rank>=1（organizer 以上）かつ自 club（viewer/別club/未ログイン拒否）');
}

// ============================================================
// POLICY: organizers の追加(INSERT)・変更(UPDATE)は owner/admin(rank>=2)。DELETE policy なし。
// ============================================================
{
  const ins = (rls||'').match(/create\s+policy\s+organizers_insert[\s\S]*?;/i);
  const upd = (rls||'').match(/create\s+policy\s+organizers_update[\s\S]*?;/i);
  assert(!!ins && /app_my_org_rank\(\)\s*>=\s*2/i.test(ins[0]), 'POL-org-ins organizers INSERT は rank>=2（owner/admin）');
  assert(!!upd && /app_my_org_rank\(\)\s*>=\s*2/i.test(upd[0]), 'POL-org-upd organizers UPDATE は rank>=2（owner/admin）');
  assert(!/create\s+policy\s+\w*organizers\w*delete/i.test(rls||''), 'POL-org-del organizers に DELETE ポリシーがない（消さず status で停止/退任）');
  // ロール昇格防止: 付与ロールは自分のランク以下
  assert(!!ins && /app_role_rank\(role\)\s*<=\s*public\.app_my_org_rank\(\)/i.test(ins[0]), 'POL-org-escalate INSERT は付与ロール<=自ランク（昇格防止）');
}

// ============================================================
// POLICY: 一般データ(players/tournaments/entries)の read は active 同 club。
// ============================================================
['players','tournaments','entries'].forEach(function(t){
  const m = (rls||'').match(new RegExp('create\\s+policy\\s+'+t+'_select[\\s\\S]*?;','i'));
  assert(!!m && /app_my_club_id\(\)/i.test(m[0]) && /app_is_active_organizer\(\)/i.test(m[0]),
    'POL-gen 「'+t+'」select は active かつ自 club');
});

// ============================================================
// GRANT. authenticated に付与・anon から revoke（publishable 単体で開けない補強）。
// ============================================================
assert(reHas(rls||'', /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*?to\s+authenticated/i),
  'GRANT1 テーブルアクセスは authenticated に付与');
assert(reHas(rls||'', /revoke\s+all[\s\S]*?from\s+anon/i),
  'GRANT2 anon からテーブルアクセスを revoke（RLS と二重に publishable 単体拒否）');

// ============================================================
// GUARD. 最後の owner/admin を消せないトリガ。
// ============================================================
assert(reHas(rls||'', /create\s+or\s+replace\s+function\s+public\.app_guard_last_admin\b/i), 'GUARD1 app_guard_last_admin 関数がある');
assert(reHas(rls||'', /before\s+update\s+or\s+delete\s+on\s+public\.organizers/i), 'GUARD2 organizers の before update/delete トリガがある');
assert(reHas(rls||'', /last\s+active\s+owner\/admin\s+cannot\s+be\s+removed/i), 'GUARD3 最後の active owner/admin を消すと raise する');

// ============================================================
// SECURITY. secret/実データ(seed) 非混入。
//   実 secret は `sb_secret_` の後に実トークン（英数 6+）が続く。README/設計の「sb_secret_…」
//   （省略記号やプレースホルダ）は "置くな" という説明であり secret 実値ではない＝除外する。
// ============================================================
const REAL_SECRET = /sb_secret_[A-Za-z0-9]{6,}/;   // プレースホルダ(sb_secret_… / sb_secret_) ）はマッチしない
assert(!REAL_SECRET.test(allSql) && !REAL_SECRET.test(readme||''), 'SEC1 SQL/README に secret key の実値(sb_secret_<token>)が無い');
assert(!has(allSql, 'service_role key') && !REAL_SECRET.test(allSql), 'SEC2 SQL に secret 実値が無い');
// migrations は実データ seed を含まない（insert into public.<table> ... values が無い）
assert(!/insert\s+into\s+public\.(members|clubs|organizers|players|tournaments|entries)\b/i.test(allSql),
  'SEC3 migrations は実データ seed(insert)を含まない（owner/club/名簿は live で投入）');
// 氏名らしき実値が migrations に無い（架空/プレースホルダ運用の確認・簡易）
assert(!/'(?:髙橋|高橋|田中|佐藤|鈴木)/.test(allSql), 'SEC4 migrations に実名らしき氏名リテラルが無い（架空/プレースホルダのみ）');

console.log('');
console.log('  DATA-PERSISTENCE-PHASE2-STAGE-A スキーマ/RLS 静的検証: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail === 0 ? 0 : 1);
