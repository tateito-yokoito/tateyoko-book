# 閉じた本番反映：実行結果（2026-09-22）

ユーザーはPITRなしの復旧制約を理解したうえで、閉鎖状態での本番反映を承認。
反映したアプリ／migrationソースは `5ea27a8eb7f8ee551ed1949ceedd51934faf6937`（アプリ実装は `8e69507` と同じ）。今回アプリコードの追加修正はしていない。

## DB

- 実行直前の本番カタログ・Edge版・deploymentは退避時と一致。driftなし。
- 最新スキーマから17本を再リハーサルしPASS。適用SQLは17本のみ、各SHA-256を照合。
- 単一transaction、lock_timeout 3秒、statement_timeout 60秒、既存関数のMD5 drift guard、履歴の同時登録、commit前の閉鎖assertを実施。
- 本番commit成功。migration履歴は97→114。
- commit後のREAD ONLY照合：リハーサルした229関数の定義が一致。
- 新しい本人接続0件、制作了承0件、family-managed扱いの既存Project 0件。既存Person・購入等を新導線へ移していない。

適用SQL SHA-256：`588d6f367c0ee7df5f21c4b326c0f1386ac8c9fa2f937a124562a5a9c3a6d36a`。
順序はRunbookの17本。`db push`による他migrationの適用は行っていない。

## Edge

|更新対象|反映前→後|verify_jwt|
|---|---|---|
|create-checkout-session|48→49|false|
|transcribe-audio|42→43|false|
|polish-transcript|41→42|false|
|publish-voice-edition|26→27|true|
|export-experience-data|9→10|false|

5本の実配信ソースと依存をダウンロードし、レビューソースとバイト一致。
sync-checkout-session v33／stripe-webhook v32／request-experience-refund v6は変更せず、版とJWT設定を再確認した。

## Front

- 正式ドメイン：`https://www.tateito-yokoito.jp/`
- Vercel project：`prj_WZM2OzVMdtm4x6VbwWLeISqMzjM4`
- 新deployment：`dpl_Bxz4BNRFCCRsibf2whHzTjg5Vbmn`（READY）
- 固定URL：`https://tateyoko-book-2msrejv9v-tateito-yokoito.vercel.app`
- 主JS：`index-CL8S98c8.js`、CSS：`index-C9lCDv5a.css`
- 本番projectへ静的artifactを直接配信。mainへのpush・GitHub Pages公開操作はしていない。
- フロントのfamily、C、TEST flagはいずれもfalse。既存本人向け全体rollout flagは有効化していない。
- HTML・JS・CSSの配信hashはローカルartifactと一致。HP本文・CTAは反映前と一致。
- `.env`、`.vercel/project.json`、適用SQLの公開URLはいずれも404。

フロント戻し先：`dpl_3kJtpyti1nfqn79EZ8mJwxdvFf37`。今回戻す必要は生じていない。

## gate状態

|対象|最終確認|
|---|---|
|DB rollout|OFF|
|allowlist|0件|
|DB subject_connection_enabled|false|
|FAMILY_PRODUCTION_ENABLED|未設定＝OFF。既存秘密設定の書換えなし|
|VITE_FAMILY_PRODUCTION_ENABLED|falseでビルド|
|VITE_FAMILY_SUBJECT_CONNECTION_ENABLED|falseでビルド|
|新規Account／本人接続／制作了承|今回作成・接続・登録していない|

娘さんのAccount作成、UUID指定、allowlist追加、rollout ON、本人SMS接続はいずれも未実行。
今後の開放にはDB／サーバーだけでなくフロントfamily flagの明示的な切替も必要。

## 既存導線Smoke

- 反映前／ローカル候補／反映後の実画面でHP本文・全CTA、本人向け入口、非family購入入口が一致。
- 「前回の続きを開く」からメール入力画面へ到達。
- ページ例外0、TEST環境への通信0。検証ブラウザーは更新系リクエストを遮断し、登録・認証メール送信・課金を実行していない。
- Edge 5本の匿名リクエストはいずれも401。checkoutはlive設定／鍵形式／DB modeの既存guardを通過したうえで認証拒否され、設定不整合による503ではない。
- 既存Projectがfamily-managedへ変わっていないことをDBで集計確認。

**確認限界：本番の認証済み本人セッションを使用していない。実ログイン後の録音・保存・製本注文・live決済のE2Eは未実施。**
TESTでのA/B完走・本人Smoke・41件回帰を本番の認証済みE2Eへ読み替えない。Cの実SMS Gateも未完了のまま。

## 異常・rollback要否

確認範囲でアプリ／DB／Edgeの異常なし。rollback・forward fixは実行していない。
検証スクリプトの待機条件（入力画面前の案内）とダウンロード先のCLI自動解決を調整して再確認したが、本番アプリの修正・再migrationはしていない。

障害時は承認どおり、commit後はfamily gateを閉じてデータ保持のままforward fix。必要ならフロントを退避deploymentへ戻す。PITRは有効化しておらず、全DB復元は別承認。

証跡：作業worktreeの `output/closed-production-release/`（Git対象外）。実行manifest、SQL、画面比較、配信hash照合、DB／Edge postflightを保存。元リポジトリ側の `output/production-release-safety/20260922/closed-production-release/` にもコピーする。

**現在は閉鎖反映済み。次の先行Supporter登録・開放は、今回とは別のユーザー承認を待つ。**
