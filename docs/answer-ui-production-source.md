# 採用済み回答UIと本流の対応

2026-10-29 の本番公開ソースは `codex/unified-answer-release-20261029` の `e190355cc332d9c98b69b69160d2d4dfed4de963` です。Vercel deployment ID と主 JavaScript アセットのハッシュは `scripts/deploy/production-source.json` に記録しています。

本番ビルド前に `node scripts/deploy/check-production-source.mjs` を実行します。公開コミットが候補コミットの祖先でなければビルドを停止します。通常の `npm run build`（Vercel の Git 連携ビルドを含む）でも回帰テストと成果物の回答 UI を確認します。`build-production.mjs` も同じ検査を行います。別の手順で直接本番にデプロイせず、このビルドを経由してください。

独立 worktree で公開した場合は、本流へ戻すまで次の本番公開を行わないこと。公開・本流統合・DB 適用はそれぞれ別に承認を得ます。将来の本番デプロイ後は、公開コミットと deployment ID をこの記録に更新し、`node scripts/deploy/check-production-source.mjs` の結果を作業報告へ添えます。

回答 UI の機能テストは `node --test scripts/tests/answer-text-draft.test.mjs scripts/tests/story-request-composer-progress.test.mjs scripts/tests/story-request-book.test.mjs scripts/tests/theme-extra-selection.test.mjs scripts/tests/trial-written-retention.test.mjs`、成果物テストは `node scripts/tests/answer-experience-release.mjs dist` です。実録音・LINE 送信・本番保存を伴う動作は、ビルド検査とは別に TEST または承認済み本番操作で確認します。

当時のローカルDB定義は `docs/answer-ui-applied-db-snapshot/` に参照用として追跡します。実環境のマイグレーション履歴番号と元ファイル名が異なるため、通常の `supabase/migrations/` へは置きません。


2026-10-30 の TEST 実保存では、無料3問の文章2件と音声1件を確認。録音ファイルは TEST Storage に存在し、文章の下書きは確定後に破棄状態になった。再読み込み後も回答を確認した。TEST の期限設定は無効だが、旧文字トリガーが期限を作ったため、音声と同じ有効スイッチを確認する修正を `202610300001_align_written_trial_retention_feature_flag.sql` に分離し、TEST に適用した。本番 DB には未適用。既存の誤作成された TEST 期限行は今回削除していない。
