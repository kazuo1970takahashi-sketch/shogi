// =============================================================================
// LIVE-BROADCAST-001 Phase 3 (§5.2 P1-c): 参加者公開ビュー用 read-only 公開 config のひな形。
//
// 使い方（配備手順の正本 = docs/notes/20260705_live_broadcast_phase3_runbook_001.md §5）:
//   1. このファイルを app/config.public.js にコピーする。
//   2. Supabase の Project URL と publishable key（anon/publishable・公開前提の鍵）を記入する。
//   3. app/config.public.js は「コミットして公開」する（GitHub Pages で配信される必要がある＝gitignore しない）。
//
// 運営用 app/config.js（gitignore・authenticated ログイン用）とは別ファイル（設計 §5.2/§5.4）。
// この鍵でできるのは RPC get_live_snapshot(slug) の実行のみ（テーブル直読・列挙・書込は不可＝設計 §4.2）。
// service_role キー等の秘密鍵は絶対にここへ書かないこと。
// =============================================================================
window.SHOGI_LIVE_PUBLIC_CONFIG = {
  url: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'sb_publishable_XXXXXXXXXXXX'
};
