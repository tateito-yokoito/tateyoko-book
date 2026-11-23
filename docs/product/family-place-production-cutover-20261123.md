# 家族アプリ本番統合（実行前チェック）

対象コード: `codex/family-production-integration`。親向け訴求の追加作業は含めない。

## 反映順序

1. 本番DBのスキーマ・RLSと既存BOOKの固定作品を読み取りで記録する。
2. `supabase/migrations/20261119000100` から `20261123100000` までの家族アプリ関連23件を**ファイル順に個別適用**する。既存のmigration historyには別番号で適用済みの旧ファイルがあるため、リポジトリ全体への `db push` は使わない。
3. `family_place_early_access` に、事前指定された**既存**の本番 `auth.users.id` のみ追加する。メールアドレスをこのテーブルやGitHubへ記録しない。
4. `family_place_access_allowed()` が許可アカウントで真、非許可アカウントで偽であること、および `ensure_family_place_home()` が非許可アカウントに `42501` を返すことを確認する。
5. 無料記録の音声処理に必要な `transcribe-audio` と `polish-transcript` のEdge Functionを、既存BOOK分岐を残した版へ更新する。本番ソースを明示的なビルドスクリプトで生成し、既存のVercelプロジェクトへデプロイする。一般向け登録導線と既存BOOKの入口は変更しない。
6. スマートフォンで `/?app=family_place` の家系図・人物・年輪・本棚・無料質問の保存と再読み込みを確認する。無関係アカウントの拒否と、既存BOOK・公開Webブック・QRの閲覧も確認する。

## 影響と復旧

- 家族アプリ用の新テーブル・RPC・Storageバケットを追加し、既存 `persons` にプロフィール用の列を追加する。既存BOOKの回答・購入・完成作品・公開URLは移行しない。
- `media_assets_shared_recipient_select` には、非公開回答のメディアを共有受取人へ返さない条件を追加する。共有可能な回答の閲覧は維持する。
- 失敗時はまず `VITE_FAMILY_PLACE_ENABLED` を無効にした直前の本番ビルドへ戻す。新しい許可リストを空にして家族アプリのDB操作も止める。適用済みの追加テーブルや列はデータ保護のため即時削除しない。
- DB変更とデプロイは、オーナーの直前承認後に実行する。
