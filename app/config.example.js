// =============================================================================
// Stage A クラウド設定（ひな形）。
//   この *.example.js をコピーして app/config.js を作り、実値を入れてください。
//   app/config.js は .gitignore 済み＝repo にコミットされません（公開リポジトリ対策）。
//
//   - url            : Supabase Project URL（例 https://xxxx.supabase.co）
//   - publishableKey : Publishable key（`sb_publishable_...`／クライアント公開前提・RLS で保護）
//
//   ★ Secret key（`sb_secret_...`）は絶対にここへ書かない・クライアントへ載せない。
//   publishable key は設計上クライアント公開可だが、当 repo は public のため
//   実値は config.js（非コミット）に置く運用とする（詳細は supabase/README.md）。
// =============================================================================
window.SHOGI_CLOUD_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_REPLACE_ME'
};
