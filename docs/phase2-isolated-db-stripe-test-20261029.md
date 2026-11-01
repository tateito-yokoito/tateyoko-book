# Phase 2 隔離DB・Stripeテスト準備（2026-10-29）

対象は隔離Supabaseブランチ `gmyqqcnbuiaghbrxnkaz` のみ。本番DB、Stripe live、公開HPは変更しない。

## 隔離DBの移行失敗

- ブランチ作成時の自動移行は `202606220001_create_activity_logs` の次、`202607300001_add_onboarding_foundation` で停止した。ログの直接原因は `public.book_projects` 不在。
- リポジトリの最初の移行は `activity_logs` だけを作る。`book_projects` などの初期スキーマを作る移行がない。
- 本番にはリポジトリにない移行履歴が複数あり、10月19日の移行にはリポジトリ内で同一バージョンのファイル名もある。この状態で既存の移行を一括再実行したり、本番へ初期スキーマを追加したりしない。
- 現ブランチにはスキーマのみを手動復元し、架空データでPhase 2のDB検証を行った。ただしこの操作は自動移行の失敗ステータスを解消せず、空ブランチでの再現性を証明しない。

### 2026-10-29 の本番スキーマ照合

- 本番と隔離ブランチの主要12表の列定義を比較。`book_projects` の2列と `commerce_orders` の6列は意図したPhase 2追加分。その他4列のNULL許容差（`commerce_orders.purchaser_user_id`、`discount_redemptions.purchaser_user_id`、`experience_contracts.purchaser_user_id`・`guarantee_days`）は**隔離ブランチだけ**本番に揃え、照会で確認した。
- `experience_contracts` の旧制約が本番の2.1契約を許さない状態だったため、隔離ブランチだけ本番と同一の3制約へ揃え、定義の一致を確認した。既存の本番移行ファイルは変更していない。
- 本番適用済みの `202609170003_family_subject_rls.sql` を隔離ブランチに再生した。再生後も家族制作の高度な同意・制作担当機能（`family_production_supporter` など）は不足し、`book_projects` の家族向け読取ポリシー2件は本番と完全一致していない。家族導線のRLS結合試験は、この差を解消するまで本番互換と判定しない。
- `MIGRATIONS_FAILED` は引き続きSupabase側の初回自動移行ステータス。現ブランチは `ACTIVE_HEALTHY` だが、同ステータスを成功扱いしない。公式の復旧手順は、欠落した初期スキーマ／移行依存を修復した後にブランチをリセットまたは再作成して全移行を再実行するもの。現時点では本番履歴・既存移行の変更を禁じられているため、勝手にリセット・リベースしない。
- 2026-10-29 時点の本番移行履歴は180件。最初の `202606220001` は `activity_logs` のみ、次の `202607300001` は未作成の `book_projects` を参照する。したがって、**既存の本番移行履歴を変更せずに、このブランチの初回自動移行だけを成功扱いに戻す手順は確認できていない**。手動適用した移行履歴は隔離DB上に残るが、元の失敗したワークフローは再実行されない。
- 既存の `output/commerce-test-20260915/baseline.sql` はスキーマのみで、`COPY`/`INSERT` 文はなく、本番データや鍵のコピーは含まない。ただし広範な権限付与と9月15日時点の定義を含むため、現状のまま新しい隔離DBへ適用することは避ける。テスト専用の最小権限・Phase 2差分を備えた再現手順として整理し、空DBで検証する必要がある。

再現可能な移行にするには、顧客データ・注文データ・秘密情報を含まない初期スキーマを版管理し、後続移行との境界を確定する必要がある。既存移行の変更や本番に適用される移行への初期スキーマ混入は避け、隔離環境専用のブートストラップを先に空DBで検証する。検証できるまでブランチの `reset` / `rebase` は実行しない（手動復元した架空テストデータも失われるため）。

## Stripeテストモードで必要なもの

| 用途 | 税込単価 | DB商品コード |
| --- | ---: | --- |
| スタンダード基本商品 | 35,000円 | `standard_bundle_v2` |
| プレミアム基本商品 | 65,000円 | `premium_bundle_v2` |
| スタンダード追加冊子 | 5,000円 | `standard_extra_v2` |
| プレミアム追加冊子 | 35,000円 | `premium_extra_v2` |
| 聞き取り制作サポート | 20,000円 | `interview_support_v1` |

いずれもStripe **テストモード**の一回払い・JPY価格、`tax_behavior=inclusive`。商品と価格は各1件ずつ、計5商品・5価格。テスト用Webhook宛先は隔離ブランチの `https://gmyqqcnbuiaghbrxnkaz.supabase.co/functions/v1/stripe-webhook`。現行ハンドラが処理するイベントは `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.expired`、`charge.refunded`、`refund.created`、`refund.updated`、`refund.failed`。**この5商品・5価格・Webhook 1件はユーザー承認済み**。本番liveの商品・価格・Webhookは変更しない。

2026-10-29、本人のDashboardログイン後、Stripeサンドボックス `wksp_test_6VAikVJdHNlKEWguIejpKVM` で `livemode=false` を確認し、承認済みの5商品・5価格・Webhook 1件を作成した。秘密鍵・Webhook署名シークレットの値はチャット・ログへ表示していない。本番Stripeのリソースは変更していない。

| DB商品コード | テスト商品ID | テスト価格ID |
| --- | --- | --- |
| `standard_bundle_v2` | `prod_VWrjPaXdbPiwPb` | `price_1UVo3KFMGRId8JGGcJ5KDRey` |
| `premium_bundle_v2` | `prod_VWrkxReS6dUNlp` | `price_1UVo3sFMGRId8JGGTyAgONIe` |
| `standard_extra_v2` | `prod_VWrlZyyYi0bJ0d` | `price_1UVo4KFMGRId8JGGV6sa1Pfn` |
| `premium_extra_v2` | `prod_VWrlu6wuXeTvYw` | `price_1UVo4wFMGRId8JGG1ULb8Tgr` |
| `interview_support_v1` | `prod_VWrmHpV4aTqxUy` | `price_1UVo5NFMGRId8JGGwfSSKHWR` |

5価格はいずれも一回払い、JPY、税込、アクティブ、`livemode=false`。Webhook `we_1UVoD5FMGRId8JGGHgFT8y3C` は上記隔離ブランチURL、指定7イベント、`livemode=false`、`enabled`。署名シークレットとPhase 2 Edge Functionsは隔離ブランチに設定・配備済み。ただしWebhookを通した支払確定の結合試験は未実施。

隔離ブランチには、2026-10-29にPhase 2の `create-commerce-v2-checkout`、`create-commerce-v2-additional-checkout`、`submit-commerce-v2-consultation`、`get-commerce-v2-consultation`、`admin-commerce-v2-consultations`、`commerce-v2-staff-production`、`queue-commerce-v2-book-production` を配備した。`stripe-webhook` はv51、`sync-checkout-session` はv52に更新し、対象9件すべて `ACTIVE` と確認した。配備先は隔離ブランチ `gmyqqcnbuiaghbrxnkaz` のみ。本番Functionは変更していない。必要Secret設定後、匿名の空リクエストはHTTP 400「同意事項を確認してください」を返した。架空データの相談申込はHTTP 200、同一リクエストキーの再送は同じ申込IDを返し、重複しなかった。`APP_URL` は隔離ブランチで `http://127.0.0.1:4188/` のSHA-256ダイジェストと照合済み。

### ユーザーによる秘密鍵の安全な設定

1. Stripe Dashboardに本人がログインし、画面上で**テストモード**であることを確認する。開発者向けの「APIキー」からテスト用シークレットキーを取得する。プレフィックスは `sk_test_`（制限付きキーなら `rk_test_`）。`sk_live_`/`rk_live_` は使用しない。
2. このチャット、Git、ターミナルのコマンド引数、スクリーンショットにはキーを貼らない。
3. Supabase Dashboardで隔離ブランチ `gmyqqcnbuiaghbrxnkaz` を開き、Edge Functions → Secrets に `STRIPE_SECRET_KEY` を登録する。**本番プロジェクト `wquxjeqkumossjxehdop` のSecretsは変更しない。**
4. 作成済みWebhook `we_1UVoD5FMGRId8JGGHgFT8y3C` の宛先詳細からその宛先専用の署名シークレットを取得し、同じ隔離ブランチのSecretsへ `STRIPE_WEBHOOK_SECRET` として登録する。APIキーとは別の値で、`whsec_` で始まる。
5. 値を表示せず、登録したSecret名と対象プロジェクトrefだけを共有する。結合試験の直前に隔離ブランチの `EXPERIENCE_COMMERCE_MODE=test`、`EXPERIENCE_COMMERCE_SUPABASE_URL=https://gmyqqcnbuiaghbrxnkaz.supabase.co`、`EXPERIENCE_CHECKOUT_ENABLED=true` を照合する。本番側のゲートは触らない。

ユーザーから2026-10-29にSecret設定完了の連絡を受領。値は取得・表示していないため、登録名・キーの有効性・ローテーション済みかは結合試験で確認する。隔離DBの決済ゲートは引き続き `disabled`。

ローカル検証アプリは独立worktreeの無追跡 `.env.local` で隔離ブランチURLと公開可能キーだけを参照し、`http://127.0.0.1:4188/` でHTTP 200を確認した。秘密鍵はローカルファイルに置いていない。隔離ブランチには `APP_URL`、`CONSULTATION_IP_HASH_SECRET`、`EXPERIENCE_COMMERCE_MODE=test`、`EXPERIENCE_COMMERCE_SUPABASE_URL` を設定済み。一時的に `EXPERIENCE_CHECKOUT_ENABLED=true` と隔離DBの `commerce_environment.stripe_mode=test` にして、無認証のCheckout空リクエストがHTTP 401「ログインが必要です」を返すことを確認した。Authテストユーザー作成でSMTP認証エラーが判明したため、両ゲートは `false` / `disabled` に戻した。本番設定には適用していない。

Stripe価格IDは隔離ブランチの `commerce_products` の該当5行へ `stripe_mode=test` として紐付け、金額・通貨・税込フラグを照合した。注文時スナップショット・請求額の一致を確認するまでは販売ゲートを有効化しない。

## 結合試験ゲート

- 2026-10-29 のローカル再確認: `node --test scripts/tests/commerce-v2.test.mjs` は13件すべて成功。前回の `npm run build` も成功（大きいJSチャンクの警告のみ）。これはStripe/Edge/DBの通し試験の代替ではない。
- 隔離DBの5商品は税込JPYで `35,000 / 65,000 / 5,000 / 35,000 / 20,000` 円と一致。Stripeサンドボックスの商品・価格IDを隔離DBの5行へ紐付け、`stripe_mode=test` を確認した。確認メール送信はブランチ側のSMTP認証エラーで失敗したため、ユーザー承認のもと**隔離ブランチだけ**メール確認を短時間オフにし、`@example.invalid` の架空ユーザーで認証を検証した。終了直後にメール確認をオンへ復旧し、画面で確認した。本番の認証設定は変更していない。
- 同じ架空ユーザーで隔離Functionの見積を検証。スタンダード単体35,000円、プレミアム単体65,000円、スタンダード＋標準2冊＋プレミアム1冊80,000円、プレミアム＋標準1冊＋プレミアム2冊140,000円で、いずれもHTTP 200。スタンダード単体のStripe**テスト**Checkoutセッション生成もHTTP 200、Checkout URLは `checkout.stripe.com`。FunctionはStripe返却額と注文額の一致を検査してからURLを返し、隔離DBの注文集計でも35,000円・セッション紐付け1件を確認した。カード支払、Webhook、復帰同期はまだ未検証。試験後、隔離決済ゲートはSecret `false` とDB `disabled` に戻した。
- 匿名相談Functionへ異なる架空 `x-real-ip` 値を付けて架空相談を2件送信したが、隔離DBの直近2件の送信元ハッシュは同一だった。少なくともこの経路ではゲートウェイがクライアント指定値をそのまま採用しておらず、ヘッダーだけの変更でIP単位の受付制限を回避できなかった。
- 追加の通し試験用に `scripts/tests/commerce-v2-isolated-session.mjs` を作成。実行先を隔離ブランチのURLに固定し、公開可能キーのみを許可し、架空購入者・担当者の認証セッションをメモリ内で保持する。ユーザー承認を得て隔離ブランチだけメール確認を一時停止し、架空ユーザー2件を作成して直後に再有効化した。本番Auth設定は変更していない。
- この架空購入者で相談申込（ギフト・標準BOOK・標準追加1冊・プレミアム追加1冊）がHTTP 200。架空担当者の `owner` 権限付与後、スタッフ一覧の初回呼び出しは403となり、隔離DBの `service_role` に `admin_users` のSELECT権限がないことを特定。隔離DBにこの読み取り権限のみ付与後、一覧200・当該申込の検出・スタッフ合意200を確認した。本番DB権限は変更していない。
- 本番DBは**読み取りのみ**で照合し、`service_role` に `admin_users` のSELECT権限が既にあることを確認した。隔離環境で追加した権限は本番と同じ状態へ揃えるためのもの。本番にはPhase 2の相談・担当割当テーブルがまだ存在せず、新規商品を本番販売できる状態ではない。
- 合意済み相談から、サポート込みの見積が95,000円、Stripe**テスト**Checkout作成がHTTP 200。内訳は標準BOOK35,000円＋標準追加5,000円＋プレミアム追加35,000円＋聞き取り制作20,000円。FunctionはStripeの返却 `amount_total` と注文額・JPY・テストモードを照合してからURLを返す。隔離DB注文でも95,000円・`interview_staff`・セッション紐付けを確認した。支払い完了後のWebhookと制作案内は未検証。
- この相談・注文は決済前に双方 `checkout_pending` で、作品ID・本人同意記録・担当者割当はいずれも存在しないことを隔離DBで確認した。未決済で制作が始まっていないことのDB側の証拠だが、担当者APIの拒否応答は別途通し試験が必要。
- さらに隔離DBで、この架空担当者と未決済相談を指定して `commerce_v2_staff_project` を呼ぶと権限エラー `42501` となることを確認した。支払前の対象作品へのアクセスをDB関数でも拒否する。ただし支払後の担当者付与・取消・別作品へのアクセス拒否は未検証。
- 隔離DBだけに架空割引コード `PHASE2FAKE1000`（基本BOOKから1,000円割引、翌日失効）を追加し、2種類の装丁へ明示的に紐付けた。Edge Function見積はスタンダード34,000円、プレミアム64,000円。スタンダード割引Checkout生成はHTTP 200で、隔離DB注文は小計35,000円・割引1,000円・合計34,000円・セッション紐付けを確認した。FunctionはStripe返却額34,000円との一致も検査済み。実在の6コードや本番クーポン設定には触れていない。
- 上記の試験後、隔離ブランチの `EXPERIENCE_CHECKOUT_ENABLED=false` とDB `commerce_environment.stripe_mode=disabled` へ復旧し、SecretのダイジェストとDB更新結果を確認した。公開可能キーによる空Checkout呼び出しもHTTP 503で閉鎖を確認した。カード支払、Webhook、復帰同期、旧注文互換性は引き続き未検証。
- StripeテストWebhookの管理画面を読み取った際、署名シークレットがアクセシビリティ結果に平文表示された。値はこの文書に記録しない。ユーザー指示により現時点のローテーションは保留し、既存の隔離環境Secretでテストを継続する。本番Webhookや本番Secretには触れない。公開前の残リスクとして改めて扱う。
- 基本商品2種、追加冊子単独・混在、制作サポート込み、クーポンを含む見積・Stripe請求・注文記録額の一致。
- 無料相談→スタッフ合意→一括決済、失敗・キャンセル・再試行、Webhook再送、復帰同期。
- 通常制作と聞き取り制作の購入後遷移、未決済の制作開始禁止、旧注文との互換性。
- 本番データをコピーせず、架空ユーザー・架空注文だけを使用する。検証終了時に隔離ブランチの継続か削除かをユーザーへ確認する。

### 追加のStripeサンドボックス結合試験（2026-10-29）

- Stripe Workbenchでサンドボックス `livemode=false` を再確認。架空の割引付き注文についてStripe Checkout小計35,000円・割引1,000円・請求34,000円と隔離DB注文の35,000円・1,000円・34,000円が一致。聞き取り制作の架空注文も、Stripe Checkoutと隔離DB注文がともに95,000円で、注文の装丁 `standard`、制作方法 `interview_staff`、相談IDとの紐付けが一致した。いずれも支払前の照合である。
- 割引付きCheckoutをStripeサンドボックスで期限切れにした。初回WebhookはHTTP 500。隔離Functionログで `stripe_event_receipts` へのservice_roleのGETが403と判明。本番DBを読み取り照合したところ本番にはSELECT・INSERT権限があり、隔離DBだけに同じ2権限を付けた。広範なTRUNCATE・REFERENCES・TRIGGER権限は付けていない。
- 同一の `checkout.session.expired` イベントをStripeサンドボックスから隔離Webhookへ再送すると、隔離DB注文は `expired` になり受領記録は1件。再度同一イベントを送っても注文状態は `expired`、受領記録は1件のままで、期限切れ経路の再送冪等性を確認した。本番Stripe・本番DBには変更なし。
- 95,000円のサポートCheckoutは支払い前に有効期限を迎え、隔離注文も `expired`。成功決済・カード失敗・復帰同期・支払後の担当者権限は依然として未検証。決済の最終操作はユーザーへ引き継ぐ必要がある。新しいCheckoutを作るには、隔離環境で認証済みの架空購入者セッションを安全に再作成する必要がある。現在のメール確認はON、隔離決済ゲートはOFFのまま。
- `MIGRATIONS_FAILED` は未解消。初回自動移行が、リポジトリにない初期スキーマの `book_projects` を前提にするため、手動復元済みの現ブランチで機能が動くことと、空ブランチから再現できることは別問題。既存移行を改変せず、データなし初期スキーマの境界を確定してから、別の空隔離環境で再実行する必要がある。現ブランチのリセットは行っていない。

### 継続試験（2026-10-30、隔離環境のみ）

- ユーザー承認の範囲で、隔離DBの `commerce_environment.stripe_mode=test` と隔離Edge Secretの `EXPERIENCE_CHECKOUT_ENABLED=true` を一時的に有効化した。架空担当者に隔離DB内だけ一時的な `owner` 権限を付け、相談一覧200・合意200を確認した。試験後、担当者権限の行を削除した。
- 架空のギフト相談（標準BOOK＋標準追加1冊＋プレミアム追加1冊）を作成し、スタッフ合意後のサポート込み見積95,000円、StripeサンドボックスCheckout95,000円、隔離DB注文95,000円と注文内訳4行（35,000＋5,000＋35,000＋20,000円）を照合した。決済前の相談・注文は `checkout_pending` であり、購入完了扱いにはなっていない。
- 架空クーポンの見積は標準34,000円・プレミアム64,000円。標準BOOKのStripeサンドボックスCheckoutは小計35,000円・割引1,000円・請求34,000円で、隔離DB注文と一致。実在クーポンや本番Stripeには触れていない。
- 34,000円のCheckoutをサンドボックスで期限切れにすると、隔離DB注文もWebhook経由で `expired` になり、イベント受領記録が1件できた。同じイベントを再送しても受領記録は1件のまま。期限切れ後、同じ架空購入者で新しい34,000円Checkoutを作成でき、別注文として `checkout_pending` になった。再試行Checkoutと95,000円サポートCheckoutも試験後に期限切れにし、隔離DBの3件すべて `expired` と確認した。
- 隔離決済ゲートはDB `disabled`、Edge Secret `false` に戻した。Secretはダイジェストで確認。隔離Authのメール確認もON。一時的な架空担当者の `owner` 権限は削除済み。本番DB・本番Stripe・本番デプロイ・公開HPは変更していない。
- **未検証**: 実際のテストカードによる成功・失敗決済、成功Webhook、決済復帰同期、支払い後の制作ルーティング・担当者付与/取消、旧注文の実接続。StripeホストCheckoutの最終支払い操作はユーザーへ引き継ぐ必要があり、支払い成功を未確認のまま販売可能とは判定しない。
- `MIGRATIONS_FAILED` は引き続き未解消。現ブランチには既に架空の試験データがあり、リセットでは再現性検証にならない。ローカルにSupabase CLI/Dockerもない。既存移行や本番履歴を変えずに確証を得るには、データなしの初期スキーマとPhase 2差分を固定し、費用・作成を別途承認された空の隔離環境で再実行する必要がある。
- ローカルの `node --test scripts/tests/commerce-v2.test.mjs` は13/13成功。`npm run build` とエントリポイント検査も成功（大きいチャンクの既存警告のみ）。`git diff --check` は問題なし。独立worktreeの未コミット変更を保持し、commit/deployは行っていない。

### 2026-10-30 の続き：空の隔離DBでの再生

- Phase 2 worktreeは既存の未コミット変更を保持したまま `codex/phase2-commerce-nov8` ブランチへ切り替えた。変更の退避・リセット・上書きはしていない。元状態のローカル復旧用パッチと未追跡ファイルのアーカイブを `/private/tmp/phase2-commerce-nov8-*` に保存した。
- 新しいデータなしSupabase開発ブランチ `xhkgbjdzwnanvsjnwrbw` を作り、最初の自動移行が前回と同じ `book_projects` 不在で失敗することを再確認した。これによって欠落が既存TESTの偶発的な状態ではなく、現行の移行列にあることが確定した。
- 既存TESTの成功済み移行SQLを `supabase/test-bootstrap/20261030/` に番号順で保存し、新ブランチで全54件を順次適用した。結果は既存TESTと新ブランチの両方でpublic表75、列946、列定義署名 `8a67e40eb223696a801ec33a9dadcb6f`、commerce関数22、対象商品5で一致。スタンダード35,000円、プレミアム65,000円、聞き取り制作20,000円を確認した。
- ただしこれは隔離TESTの**手動復元手順の再現**で、Supabaseの自動移行ステータス `MIGRATIONS_FAILED` の解消ではない。新ブランチには購入者・Stripe Secret・Edge Function・注文データをコピーしていない。リリース前には、自動移行の初期スキーマ欠落を別途解消するか、このTEST専用復元経路を運用上承認する必要がある。
- 本番では旧 `self_book_v1` の有効クーポンが7件になった。V2への対応付け移行の固定安全条件を7件に更新したが、本番DBへは未適用。適用直前に件数・対象・割引範囲を再確認する。旧注文と旧価格IDは変更していない。
- TESTのStripe成功決済・Webhookは依然0件。実利用者による隔離TEST購入を待ち、注文の `paid`、受領イベント、制作ルートを保存先まで検証する。
- 2026-10-30に隔離TESTの `commerce_environment.stripe_mode` と `EXPERIENCE_CHECKOUT_ENABLED` を一時的に有効にし、未認証のV2購入APIが401を返すことを確認した。購入者の実操作はローカル画面の端末間接続で止まり、実決済・成功Webhookは未検証。作業終了時に両ゲートを元の無効状態へ戻し、`APP_URL` も元のローカルURLへ復元した。再開時はTEST接続先・購入者ログイン・スマホからの接続を確認してから、一時的にTESTだけを有効化する。
- スマホからのLANプレビュー表示は確認したが、新規登録の認証メール送信で失敗した。隔離TESTの `auth_logs` は `/otp` がHTTP 500、SMTP応答 `535 Authentication credentials invalid` と記録。TESTのカスタムSMTP（Resend）の認証情報が使えない状態であり、メールアドレス誤入力やアプリの登録UIが直接原因ではない。スマホ用 `http://192.168.10.122:4188/**` はTESTのAuth許可URLへ一時追加したが、メール送信失敗後に削除し、元の3件に戻した。Supabaseの標準SMTPは組織の許可済みメールアドレスに送信先が限られるため、任意のTEST購入者メールの代替として無条件に切り替えない。
- ユーザーはTEST購入者についてメール認証のみ利用可能。TESTのカスタムSMTPを無効化する確認画面には「カスタムメールテンプレートをリセット」「送信上限2通/時」と表示されたため、変更をキャンセルし、再読込で設定が有効のままと確認した。次の正規の復旧は、Resend側で有効な送信用APIキーを管理者本人が取得し、隔離TESTのSupabase Auth > Emails > SMTP Settingsのパスワード欄へ入力すること。秘密鍵をチャットやローカルプレビューへ渡さない。TEST認証メールが送れるようになってからスマホ用戻り先を一時追加し、登録・購入の通し検証を再開する。

### 2026-10-31 スマホでの成功決済

- 隔離TESTのSMTPを復旧後、スマホでメール認証、作品・質問の保存と商品選択画面まで到達した。HTTPのLANプレビューでは `crypto.randomUUID()` が使えず暗転したため、専用購入コンポーネントのリクエストキー生成を `crypto.getRandomValues()` に変更した。追加冊数は0〜30冊の選択式とし、装丁の選択状態を明示した。画面更新時は `.env.local` に `VITE_COMMERCE_V2_ENABLED=true` が必要。
- TESTの決済ゲートを一時的に有効化。架空の割引キャンペーン `PHASE2FAKE1000` は期限切れだったため、この内部テスト用キャンペーンだけを24時間延長して見積を確認した。スタンダード35,000円から1,000円引いて34,000円。終了時に期限を元へ復元した。
- 利用者がStripeの**テストモード**でテストカード決済を完了した。隔離DBの注文 `TY-2026-001015` は小計35,000円・割引1,000円・支払34,000円、`paid`、CheckoutセッションとPayment Intentあり。`stripe_event_receipts` に `checkout.session.completed` が1件、`livemode=false`。対象作品は `access_status=paid`、契約には決済確認日時と制作開始日時・終了日時が入った。割引利用も `redeemed`。既存13注文の状態別件数は試験前と同じ5件pending・6件expired・2件paid。
- 試験後、隔離DBの `commerce_environment.stripe_mode=disabled`、Edge Secretの `EXPERIENCE_CHECKOUT_ENABLED=false`、`APP_URL=http://127.0.0.1:4188/` に戻し、Secretはダイジェストで照合した。本番DB・本番Stripe・本番Vercelは変更していない。購入後のスマホ画面から制作の続きを開けるかは利用者の操作確認待ち。`MIGRATIONS_FAILED` の自動移行問題も別途残る。
