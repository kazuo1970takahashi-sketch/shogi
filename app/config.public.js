// =============================================================================
// LIVE-BROADCAST-001 Phase 3 (§5.2 P1-c): 参加者公開ビュー用 read-only 公開 config（実値・コミットして公開）。
// 配備手順の正本 = docs/notes/20260705_live_broadcast_phase3_runbook_001.md §5。
// 運営用 app/config.js（authenticated ログイン用）とは別ファイル（設計 §5.2/§5.4）。
// この鍵でできるのは RPC get_live_snapshot(slug) の実行のみ（テーブル直読・列挙・書込は不可＝設計 §4.2）。
// service_role キー等の秘密鍵は絶対にここへ書かないこと。
// =============================================================================
window.SHOGI_LIVE_PUBLIC_CONFIG = {
  url: 'https://nmlrqgubszmpidddfwvw.supabase.co',
  publishableKey: 'sb_publishable_H_nzSzdiUdr6eV4nSzfVnw_jXlLYZ-I'
};
