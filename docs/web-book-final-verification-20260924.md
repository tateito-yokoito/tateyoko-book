# Webブック本番反映前・最終検証（2026-09-24）

対象は隔離TEST作品のみ。本番DB／本番Stripe／既存顧客データは変更していない。本番反映は未実施。

## PASS

- Stripe TESTの同一決済で `checkout.session.completed` の受領記録を確認した後、`sync-checkout-session` を2回、`complete_book_order` を再実行。テキスト作品と実Storage素材作品の双方で、注文1件、completed候補1件、Webブック1件、恒久URL、作品セットの状態・ID・件数が不変。Webhookの強制再送そのものではなく、Webhook＋syncの重複経路で検証した。
- 隔離TEST作品の実Storage音声2本（元の語り＋語り足し）と写真1枚を使い、管理者Live Previewで署名済み素材を取得。仕上げ→注文候補→Stripe TEST決済成功→完成snapshot→本棚→匿名の完成Webブックを実画面で通した。実課金なし。動画はこの作品には含めていない。
- 完成時に公開側へコピーされた音声2本・写真1枚のSHA-256が元ファイルと一致。完成後に隔離TEST作品の制作側文章・音声参照・写真参照を変更しても、完成Webブックの文章・公開メタデータ・3ファイルの内容・恒久URLは不変。公開Edgeの署名URLからも3ファイルを取得しハッシュを照合した。
- 390pxのモバイルChromiumで完成Webブックの連続再生入口、固定ミニプレイヤー、実音声の再生・一時停止・シークを確認。初回の非同期ロード後に再生ボタンをもう一度押す必要があるケースがあったが、その操作で再生した。iPhone Safari実機のPASSとは扱わない。
- TESTの一般Viewerは完成作品を閲覧できるが制作中の語りを閲覧不可。失効Supporterは支援先ホーム・制作中の語り・管理者顧客体験内Webブックを閲覧不可。別Projectへの制作中語りアクセスも拒否。TEST用の一時権限・共有設定は削除／復旧済み。
- 終了時にTEST DB rollout OFF、TEST Edge `BOOK_COMPLETION_ENABLED=false` を設定。一時管理者権限0件、一時共有設定0件をREAD ONLYで確認。

## 未確認

- iPhone Safari実機でのTOP、個別語り、音声、語り足し、連続再生、シーク、fixed mini player、safe-area、動画。接続可能なiPhone／Simulatorがなく、macOS上のPlaywright WebKit実行ファイルも未導入。モバイルChromiumは代替であり実機確認ではない。
- 実Storage動画を含む決済・完成・再生の一貫E2E。動画を含む隔離TEST注文は今回作成していない。
- 同一WebhookイベントのStripeからの強制再送、および初回確定時のWebhookとsyncの厳密な同時競合。受領済みWebhook＋後続sync重複、およびDB完成RPC再実行はPASS。

## 本番リリースを止める問題

- `publish-voice-edition` の素材コピーは、`requireFamilyAssetAccess(...)` の戻り値を確認していない。`family_assert_asset` が `false` を返してもservice-roleによるコピーへ進む。隔離TESTの通常作品パスで `family_assert_asset=false` を確認したにもかかわらず、実Storage素材のコピーが成功した。現行 `media_assets` のINSERT RLSは主に `user_id=auth.uid()` を確認し、`storage_path` が当該Projectに属することまでは保証しない。参照パス差し替えによる他作品素材コピーの可能性を排除できないため、**本番反映前にProjectとStorageパスの認可を厳密化し、false・別Project・別Personを拒否する回帰テストが必要**。音声・写真・動画に加え、表紙コピーのパス検証も点検する。

## 後続タスクでよい問題

- 印刷会社へのQR実入稿接続、Premium追加、完成後増刷のE2E。今回の初回完成ライフサイクルには含めない。本棚には「増刷は各作品の管理画面から」と案内が残る一方、完成済みBookBuilderでは注文完了表示に入り、今回の検証では増刷決済へ進む操作を確認していない。利用者に未提供の増刷を約束しないよう、公開前に案内文の整合を見直す。

## QA記録

再現用のTEST専用スクリプトは `scripts/tests/web-book.final-remote-check.mjs`、`web-book.storage-qa-setup.mjs`、`web-book.storage-preview-check.mjs`、`web-book.storage-freeze-check.mjs`、`web-book.public-media-check.mjs`、`web-book.permission-remote-check.mjs`。認証情報はリポジトリに保存していない。
