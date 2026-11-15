# BOOK回答UI・代表者本番レビュー反映記録（2026-11-16）

一般向け新規購入は閉じたまま、代表者レビュー用のBOOK回答UIを本番へ反映した。画面コードのソースは `0530423`。後続コミット `0bc3ae8` / `66a8cc0` にある先行案内フォームは本番ビルドへ含めていない。mainへの統合は行っていない。

## 反映

1. 本番Supabase `wquxjeqkumossjxehdop` のDBパスワードは代表者が再設定。旧値が不明だったため。DB直結ツールがあれば新値への更新が必要。秘密値はコード・GitHub・報告に記録しない。
2. 直前暗号化論理バックアップを `2026-11-15 14:58:15 UTC` に取得。保管先はMacの `~/Library/Application Support/nenrin-prod-book-answer-backups/20261115T145815Z`。暗号化ファイルのSHA-256一致、復号ストリームの `pg_restore` 全件解析、対象件数照合に成功。暗号化パスフレーズは代表者が別途保管。範囲はpublicスキーマとデータ。Storageファイル実体は含まれず、今回の反映ではStorageを変更していない。
3. SQLを `20261114000100_book_answer_photo_drafts.sql` → `20261115000100_scope_recording_commit_to_book_project.sql` → `20261115000200_scope_answer_text_drafts_to_book_project.sql` の順に適用。各migrationの履歴を確認。既存 `answers` 208件、`answer_text_drafts` 106件は適用前後で件数不変。下書きの主キーは `(user_id,book_project_id,sequence_order)`。写真下書き表はRLS有効。
4. `publish-voice-edition` のみversion 56→57に更新。JWT検証と本番稼働中の共有依存2ファイルは維持。
5. `0530423` を切り出した本番専用ビルドをVercel本番へ配信。16件の対象テストが成功。deployment `dpl_9FReuff4GBEhfqdn1rYBhww6hpVw`、本番URL `https://www.tateito-yokoito.jp/`。本番Supabase refを使用し、先行案内画面・TEST設定は含めない。TEST ref文字列1件は既存のTEST招待を拒否する比較用で、接続先設定ではない。

## 最小スモークテスト

- 一般向け `create-commerce-v2-checkout` の無認証・注文を作らない確認は配信前後ともHTTP 503。購入ゲートは閉状態。
- 本番の既存ギフトTEST作品「菅原 ギフトテスト」で明色質問画面を開き、架空の氏名回答を正式保存。次の問いへ進み、再入場後も「語りを見る」1件／1テーマを確認。DBでも当該TEST作品の回答1件を確認。
- 同じTEST作品の「本に仕上げる」で回答を収録対象にし、B5・4ページの紙面プレビューに質問と本文が表示されることを確認。注文・BOOK完成操作は行っていない。
- 家族の本棚から既存公開済みTEST1106のWebブックを開き、章・本文を確認。新規公開は行っていない。

## 別作業・残存リスク

- 先行案内は未反映。別途 `20261115000300_launch_interest.sql`、`submit-launch-interest` Edge、`early-access/index.html` とHP CTAの差分を審査・適用する必要がある。BOOK反映へ混ぜない。一般向け購入ゲートは閉じたまま。
- 本番DBパスワード再設定により、旧パスワードを保持する外部DB直結ツールは接続できなくなる。利用中の外部ツールがあれば管理者が更新する。
- 今回の本番スモークでは新たな録音・写真アップロード、PDF生成、BOOK完成・公開は再実施していない。隔離TESTでの既存成功証跡を使用する。
- バックアップの `pg_restore` 解析は成功したが、別DBへの実復元は行っていない。障害時は既存デプロイへのVercelロールバック、Edge旧版への復帰、対象限定のDB前進修正を優先。バックアップを直ちに本番へ全量復元して新規顧客更新を失わせない。
