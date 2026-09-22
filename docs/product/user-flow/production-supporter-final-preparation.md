# A/B先行本番：反映直前準備結果（2026-09-22）

対象アプリコード：`8e69507b2c56de0dae8d2fc231f5c967a065d27f`。
本番DB／Edge／サイト／環境設定／allowlistは一切変更していない。実SMS、live課金、restoreも実行していない。

## 判定

**技術的な事前照合はPASS。閉じた本番反映の承認待ち。**
先行Supporter Accountは未指定でよい。反映後もDB rollout OFF／allowlist空／C OFFで停止し、実Account登録・UUIDの明示承認後に初めてA/Bを開放する。

復旧上の注意：PITRがOFFのため「移行直前へ無損失に戻せる」とは言えない。下記の復旧方針と残る確認範囲を含めて承認する。

## 検証

- 本番カタログ：10:13 JST再取得。71テーブル、884列、176関数、97 migration。重複index候補4種類すべて0。
- 17本を最新スキーマから外側単一トランザクションで再リハーサルPASS（10:26 JST）。動的置換対象23か所、TESTとの差分0。
- 移行後 `enabled=false / allowlist_count=0 / subject_connection_enabled=false` をローカルassert。
- A/B TEST注文までの実画面、本人Smoke、拒否系、41件回帰は直前コミットの結果を維持。今回アプリコードやmigrationの内容は変更していない。
- Cは未完了。実SMS本人認証→接続→本人停止→再了承拒否の実画面Gateは独立して残す。

## 本番の配信元と退避

正式ドメイン：`https://www.tateito-yokoito.jp/`。

|対象|確認・退避結果|
|---|---|
|本番Vercel project|`prj_WZM2OzVMdtm4x6VbwWLeISqMzjM4` / `tateyoko-book`|
|現行deployment／戻し先|`dpl_3kJtpyti1nfqn79EZ8mJwxdvFf37`、READY、`tateyoko-book-1fwtvb49c-tateito-yokoito.vercel.app`|
|元Git commit|`ad017b8e1846ca22783bf8a3085b129f461540a6`、main|
|配信中フロント|index.html、`index-MxjW3yaa.js`、`index-DOaTzFCX.css`と静的に発見可能な依存、計30ファイルをGET退避・SHA-256記録|
|対象Edge|8本の実ソース・依存・版・JWT設定を関数別に退避・hash記録|
|DB|READ ONLYカタログ・関数定義・RLS等を保存。実顧客データのローカルコピーではない|

フロントのGET退避は完全なVercel deployment exportではない。動的にしか参照されない素材を網羅したとは断言しない。通常のフロント復旧先は保持されている上記deploymentとする。GitHub Pages artifactは別ホスティングのため、正式ドメインの戻し先とは扱わない。

ローカル退避先（Git対象外）：
`output/production-release-safety/20260922/`（元リポジトリ側）。
`safety-snapshot.tar.gz` SHA-256：`c02ef19c14cca15aeb28cd179ead830e4f4403310082812c9f5efbad7f306752`。
別途 `supporter-preflight/` に今回のカタログ・17本のhash・リハーサル結果を保存。
秘密のセッション・秘密鍵の実値・顧客レコードはアーカイブしていない。

## Edgeの最終対象

更新する5本（版は退避時）：

- create-checkout-session v48、verify_jwt=false
- transcribe-audio v42、false
- polish-transcript v41、false
- publish-voice-edition v26、true
- export-experience-data v9、false

sync-checkout-session v33／stripe-webhook v32／request-experience-refund v6は、依存experience-commerce.tsを含め現行本番とレビューbranchが同一。再デプロイ不要。決済同期・署名済みwebhook・正当な返金をfamily停止で遮断しない。

## 設定確認（秘密値非表示）

Supabase secrets一覧のダイジェストと、既知の非秘密の期待値だけをSHA-256照合した。

|項目|現在値の照合結果|
|---|---|
|SUPABASE_URL / EXPERIENCE_COMMERCE_SUPABASE_URL|本番ref `wquxjeqkumossjxehdop` と一致|
|EXPERIENCE_COMMERCE_MODE|live|
|EXPERIENCE_CONTRACTS_V2_TEST_ONLY|false|
|EXPERIENCE_CHECKOUT_ENABLED|true（既存本人購入用。勝手に変更しない）|
|APP_URL|正式本番URL（末尾 /）|
|FAMILY_PRODUCTION_ENABLED / FAMILY_TEST_ENABLED|いずれも本番未設定。新gateは閉じる|
|EXPERIENCE_NOTIFICATIONS_ENABLED|true（既存設定。今回ONにしたものではない）|

Stripe／webhook／OpenAI／サービス鍵等の存在は確認。鍵の実値・Stripe endpointの紐付け・実課金成功は今回未確認。既存値を保持し、runtimeのmode／署名検証を維持する。
Vercelの本番設定はSupabase URL／anon keyの2件で、sensitive値はAPIで開示されなかった。実配信JSを検査し、本番URL／anon role／本番refを確認、TEST URLなし。鍵文字列は報告・保存しない（公開artifactに含まれるanon keyを除く）。新family／C／TESTのflagはまだ追加していない。

## DB復旧手段

物理バックアップ7件がCOMPLETED。最新は2026-09-22 04:24 JST（ID 1744892338）。PITR=false。
復元実行・復元先での整合検証は行っていない。物理バックアップの存在は、任意時点の復元やStorage実体・Stripe状態の同時復元を保証しない。

通常の戻し方は、(1)トランザクション未commitならrollback、(2)commit後ならfamilyのgate close、(3)既存データを保持してforward fix、(4)フロントは現行deploymentへ戻す。
本番DB全体のrestoreは日次バックアップ以降の更新喪失を伴い得るため別承認。移行直前の復旧点が必要なら、PITR導入等の費用・運用を含め先に判断する。今回勝手に有効化しない。

## 次の実行手順（まだ実行しない）

1. 閉じた本番反映の承認を得る。PITRなしの復旧方針も確認する。
2. 実行直前にスキーマ・Edge版・deploymentを再照合。今回からdriftがあれば停止。
3. 17本のみをhash確認、外側単一トランザクション・短いlock timeout・適用履歴同時登録で反映。日付順の一括db pushはしない。commit前にOFF／空／C OFFをassert。
4. 新familyサーバーflag OFFのまま5 Edgeだけを反映。JWT設定維持。本人既存導線・拒否系を確認。
5. TESTではない本番用artifactをVercel本番projectへ明示配信。HP一般CTAとmainは変更しない。C false、TEST false。family UIを表示してもDB／Edgeは閉じたまま。
6. 娘さんはメール認証・Account登録だけ実施。通常の初期レコードが作られる可能性はあるが、母の制作・購入はまだ始めない。
7. UUIDをREAD ONLYで特定し、本人確認・運営承認後にallowlistへ登録。開放は別承認。CはOFFのまま。

**今回の成果物は準備結果であり、本番変更の実行報告ではない。**
