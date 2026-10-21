# LINE公開候補（2026-10-21）

## 2026-10-21 現在

- 最新の `origin/main` へ載せ替え済み。LINE管理画面で送信先を誤ってメールと表示しない修正を追加。LINE関連テストと `npm run build` は成功。本番公開はまだしていない。
- テスト環境の配信workerで、仮の問い1件をLINEへ実送信。HTTP 200、対象1件・送信成功1件・失敗0件、配信ログ `line/sent` を確認。本人のiPhoneでもLINEへの到着と外部ブラウザ起動を確認した。
- 旧配信台帳でLINEのみの通知がメール扱いになる問題を発見。テスト用worker v13で新規記録を実チャネルに修正し、単体テスト成功。既に送った仮の1行は監査のため書き換えていない。
- 仮スケジュール・仮通知設定・テスト環境の `LINE_DELIVERY_ENABLED` はOFFに復元。仮プロジェクトの削除はSupabase管理APIの `Invalid or expired requestState` により未完了だが、対象IDと配信停止を再確認した。同じ失敗経路で削除を繰り返さない。
- 本番では既存アカウントの手動連携を有効化した。`line-connection` / `line-webhook` v1 を配置し、`super-task` v69 に実チャネルを記録する限定修正を適用・取得確認した。LINEの資格情報は未登録で、`LINE_DELIVERY_ENABLED=false`、LINE通知先0件。配信は開始していない。
- 本番Authの `custom:line` は有効化済み。本番Supabaseの認証エンドポイントからLINEログイン画面への遷移を確認した。`LINE_LOGIN_CHANNEL_ID`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_MESSAGING_CHANNEL_SECRET` は本番Secretsへ保存済み。本番Webhookは署名なし試験リクエストを401で拒否。LINE ManagerのWebhook URLを本番へ変更後、公式アカウントへのテスト送信に対して本番関数がLINEの `LineBotWebhook/2.0` をHTTP 200で受けたことをログで確認した。
- 本番LINE認証の実機テストで、2つ目のLINEアカウントからQRログイン・スマホ側の本人確認を完了し、本番サイトへ戻った。本番Supabaseに `custom:line` のidentityが1件作られたことを確認した。これは認証単体の確認であり、本番サイト内のLINE登録導線の公開確認ではない。
- プレビュー用ビルドでLINEを有効にし、本編の新規・既存ログイン画面を確認。無料3問は従来どおりメール必須で、シニアの離脱原因が残る。本番Supabaseの許可済みリダイレクト先にはPR固有のVercel URLがないため、プレビューからLINE認証すると本番トップへ戻る。PR専用URL追加の可否を確認中。
- GitHubの本人認証を完了し、ブランチ `codex/line-release-candidate` を送信。ドラフトPR #7を作成済み。サイトの本番公開、Android、無料3問とメール/SMSの回帰が残る。workerはこのブランチの旧ソースから再デプロイしない。

このブランチは `origin/main` から作成し、LINE認証・通知UIとLINE専用のサーバー部品を切り出した。元の作業ツリーにある本・管理画面等の大量の別変更は含まない。

- `VITE_LINE_AUTH_ENABLED` の既定値は `false`。本番にはまだ公開しない。
- LINEのみの利用者はStripe Checkoutへ空のメールアドレスを渡さない。
- DBに有効な受け取り時間が保存されるまで、画面の「LINEで受け取る」を有効にしない。
- SQLを含む全テスト36件、LINE有効の `npm run build`、単一アプリの公開エントリ検査は成功。SQLテスト用の `@electric-sql/pglite` は検証用に一時導入し、依存定義・lockfileは変更していない。
- LINEの接続、Webhook、送信ヘルパー、DB移行のソースを含む。移行はテスト/本番DBには既に適用済み。再適用しない。
- 配信workerのソースはこの候補では更新していない。既に配置済みのworkerを再デプロイしないこと。LINE以外も含むworker全体の取り込みは安全審査で拒否されたため、分割検証・明示確認なしに迂回しない。
- テスト環境で実際の問いのLINE配信とiPhoneでの外部ブラウザ起動は確認済み。本番AuthのLINE認証完了までiPhone実機で確認済み。PRのVercelプレビューではLINE機能を有効にしてUI回帰を検証する。本番GitHub PagesではフラグはまだOFF。無料３問および既存メール/SMSの実機回帰と合わせ、これらを確認してから本番フラグを有効化する。
- 実機は現時点で iPhone のみ利用可能。Android の LINE→外部ブラウザは未検証のまま公開済みと扱わない。
- 先行検証では認証エラーやブラウザのタイムアウトがあったが、その後の安全な単一対象のテストで実送信成功を確認した。古い失敗結果を現状の未完了項目と取り違えないこと。
