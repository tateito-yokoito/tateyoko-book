# 購入V2・隔離TEST差分と実決済前ゲート（2026-11-15）

対象は Supabase TEST `zpswxefgfabzvxdbtyvq` とレビュー候補 `a63db03`。本番 `wquxjeqkumossjxehdop` は定義の読み取りだけ。TEST購入系DB・Edge・Webhook、Stripe、画面コードはこの調査で変更していない。別TESTアドレスの登録・ログイン・決済もしていない。

## 確定した差分

| 接続点 | 現行TEST | 購入V2に必要な状態 |
| --- | --- | --- |
| 商品 | `self_book_v1` 49,800円など旧商品のみ。DBのStripe modeは `test` | 標準35,000円、プレミアム65,000円、追加冊子2種、聞き取りサポートの5商品。各TEST Price IDはStripe test modeの同額・同商品・一回払いと照合する。live Price IDは使わない。 |
| DB | V2用4表、注文6列、作品2列、見積・注文等のV2関数と2トリガーがない。既存の同名商取引関数の一部は本番定義と異なる | 既存TEST関数との依存・差分を確認したうえで、正本migration由来の必要な定義だけを依存順に導入する。既存行は更新・削除しない。 |
| 認証引き継ぎ | `commerce_purchase_handoffs` とEdge `commerce-purchase-handoff` がない | 商品選択から認証後の同一注文経路を維持する表・Edge。 |
| Checkout | `create-commerce-v2-checkout` がない | TEST向けEdgeと共有コード。`APP_URL`、TEST Supabase URL、test key、`COMMERCE_V2_CHECKOUT_ENABLED`、`EXPERIENCE_CHECKOUT_ENABLED`、`EXPERIENCE_COMMERCE_MODE=test` を確認する。 |
| 決済反映 | TEST `stripe-webhook` v69、`sync-checkout-session` v67。候補とは内容が違う | 既存の署名・領収・旧注文処理を保持し、V2初回購入の実際の呼出し経路に必要な差分だけを取り込む。版番号だけで上書き判断しない。 |
| Stripe・Web設定 | TEST Stripe商品・価格、Webhook endpoint、署名secret、Edge secretの存在は未確認。ローカルのV2画面フラグは未設定 | TEST専用URL・test modeの設定を確認してから画面ゲートを有効化する。 |

比較根拠: 本番/TESTの `commerce_products`、`commerce_environment`、`information_schema`、`pg_proc`、migration履歴、Edge一覧と稼働ソースを読み取り照合。TESTには注文58件、作品107件、Stripe event receipt 72件が存在する。個別行や秘密値は取得・保存しない。正本は `supabase/migrations/20261031125930_phase2_product_commerce_v2_20261031.sql`、`20261107010000_commerce_purchase_handoffs.sql`、`20261107160000_interview_support_pay_before_consultation.sql` と現在の購入V2 Edgeソース。977行のV2初期migration全文を現行TESTへ無審査で適用しない。

## 適用前の保全と復旧

1. TESTの管理バックアップ/PITRの有無と復元時刻を確認する。利用不可なら、TEST専用の暗号化した論理バックアップを権限制限付きで作る。少なくとも既存注文・注文内訳・ギフト注文・招待・契約・割引利用・作品・Webhook receipt・商品定義と、関連する関数/ポリシー/トリガーの定義を対象にする。バックアップはGitHubに置かず、復元可能性を先に確認する。
2. TEST稼働中の購入系Edgeソース、設定（`verify_jwt` を含む）、版とハッシュを保存し、適用前の件数・定義差分を記録する。秘密値はバックアップ資料やログに含めない。
3. 失敗時はCheckout/画面のV2ゲートを閉じて新規開始を止める。Edgeは保存したTEST版へ戻す。DBは全体巻き戻しで後続のTEST作業を消さず、失敗した段階のトランザクションをロールバックするか、対象を限定して前進修正する。新V2商品に注文参照が生じたら商品行は無条件削除しない。既存注文・作品・receipt・Storageは保持する。

## 段階的な適用順

1. **前提照合**: TESTの既存関数・制約・RLS・商品・注文データと正本SQLを文単位で比較し、追加と既存定義の置換を分離する。`register_experience_contract` 等の共用関数の変更は、旧注文58件とギフトの動作へ与える影響を確認する。
2. **DB**: V2列/表/制約/RLS/見積・注文関数/支払後関数/トリガーを依存順に小分けのトランザクションで導入する。旧商品・注文・Webhook履歴は変更しない。引き継ぎ表を追加する。V2商品はTEST Price IDを照合してから投入する。
3. **Edge**: `commerce-purchase-handoff`、`create-commerce-v2-checkout` の必要な依存だけをTESTへ配置する。既存 `stripe-webhook` と `sync-checkout-session` は差分をレビューし、V2初回購入に必要な分岐のみを統合する。既存のJWT設定と署名検証を維持する。
4. **設定と画面**: TEST Stripe endpoint/secret・APP_URL・TEST Supabase URLを照合し、TEST画面のV2フラグを最後に有効化する。完了までCheckoutゲートを閉じる。

## 実決済前の合格条件

- TESTへの接続先が画面・Edge・DB・Stripe Webhookで一致し、live key/Price/Webhookを参照しない。秘密値は表示・記録せず、管理画面で名称・mode・存在と照合結果のみ記録する。
- 本人・ギフトA/Bそれぞれについて、見積金額が商品選択とTEST Stripe Priceの金額/通貨/商品/課税設定に一致する。割引・追加冊子の見積も含む。見積確認では注文を作らない。
- 無効なWebhook署名は拒否され、receipt・注文状態が変わらない。有効なTEST署名でのイベント取扱いと再送の冪等性をTESTで確認する。
- 同じ `request_key_v2` の重複注文で二重作成されず、異なる内容でのキー再利用は拒否される。試験データは架空とし、可能ならトランザクションで戻す。
- 支払成功・失敗・中断と戻り照合が既存注文を変更しない。ここまで通った後にだけ、提供済み別TESTアドレスの登録/ログインとStripe実テスト決済へ進む。

## 現在できること・接続不足

**実施可能:** 本番/TEST定義とコードの読み取り比較、影響範囲の特定、バックアップ/適用/復旧計画、ローカルの静的テスト。購入系TESTの変更や実決済は未実施。

**現接続では未確認:** Stripe test Dashboardの5価格、Webhook endpointとイベント、test API key/署名secretの設定、TEST Edge secretsの存在、TEST管理バックアップ/PITRと復元手段。接続ツールにはStripe管理機能とSupabase secret一覧/設定機能がなく、現在のブラウザにも対象管理画面の認証済みタブがない。秘密値をチャット・ログ・GitHubに出さず、権限のある管理画面または安全なCLI環境でこれらを照合する必要がある。確認できるまでTEST購入環境の準備完了とも実決済E2E合格とも扱わない。
