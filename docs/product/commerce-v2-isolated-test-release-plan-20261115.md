# 購入V2・隔離TEST差分と実決済前ゲート（2026-11-15）

対象は Supabase TEST `zpswxefgfabzvxdbtyvq` とレビュー用ブランチ `codex/book-answer-shared-design`。本番 `wquxjeqkumossjxehdop` は定義の読み取りだけ。TEST購入系DB・Edge・Webhook、Stripe、画面コードはこの調査で変更していない。別TESTアドレスの登録・ログイン・決済もしていない。

## 確定した差分

| 接続点 | 現行TEST | 購入V2に必要な状態 |
| --- | --- | --- |
| 商品 | `self_book_v1` 49,800円など旧商品のみ。DBのStripe modeは `test` | 標準35,000円、プレミアム65,000円、追加冊子2種、聞き取りサポートの5商品。各TEST Price IDはStripe test modeの同額・同商品・一回払いと照合する。live Price IDは使わない。 |
| DB | V2用4表、注文6列、作品2列、見積・注文等のV2関数と2トリガーがない。既存の同名商取引関数の一部は本番定義と異なる | 既存TEST関数との依存・差分を確認したうえで、正本migration由来の必要な定義だけを依存順に導入する。既存行は更新・削除しない。 |
| 認証引き継ぎ | `commerce_purchase_handoffs` とEdge `commerce-purchase-handoff` がない | 商品選択から認証後の同一注文経路を維持する表・Edge。 |
| Checkout | `create-commerce-v2-checkout` がない | TEST向けEdgeと共有コード。`APP_URL`、TEST Supabase URL、test key、`COMMERCE_V2_CHECKOUT_ENABLED`、`EXPERIENCE_CHECKOUT_ENABLED`、`EXPERIENCE_COMMERCE_MODE=test` を確認する。 |
| 決済反映 | TEST `stripe-webhook` v69、`sync-checkout-session` v67。候補とは内容が違う | 既存の署名・領収・旧注文処理を保持し、V2初回購入の実際の呼出し経路に必要な差分だけを取り込む。版番号だけで上書き判断しない。 |
| Stripe・Web設定 | Phase 2 TEST商品5件と現TEST宛先のアクティブWebhookを確認。EdgeのStripe関連Secret名は存在するが値の対応は未照合。ローカルのV2画面フラグは未設定 | TEST専用URL・test mode・署名secretとの対応を確認してから画面ゲートを有効化する。 |

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

**現接続で残る確認:** 追加3価格の現行税区分、Stripe TESTのtest API keyとWebhook署名secretがTEST Edge設定と対応すること、当日分を復元できるバックアップ。管理画面で商品・Webhook・Secret名・定期バックアップは確認できたが、Secret値は表示していない。確認できるまでTEST購入環境の準備完了とも実決済E2E合格とも扱わない。

## 2026-11-15 実行結果と次の適用単位

読み取り専用SQLを隔離TESTで再実行し、`stripe_mode=test`、V2商品0、V2見積/注文関数なし、引き継ぎ表なし、既存注文58・作品107・Webhook receipt 72を確認した。`scripts/tests/commerce-v2-test-quote-preflight.mjs` はTESTのURLと公開鍵だけを許し、注文を作らない公開見積4ケースを検査する。現時点では全4ケースがHTTP 404（Checkout Edge未配置）で、準備未完了を正しく検出した。購入関連のローカル自動テストは32件成功。別の旧隔離環境を固定した手動API認証試験は今回のTESTでは実行対象外。

TEST稼働Webhookへ架空イベントを**無効な署名**で送り、HTTP 400 `Invalid signature` を確認した。`stripe_event_receipts` は72件のままで、該当イベントのreceiptは0件。これは拒否側だけの検証であり、有効なTEST署名・再送・決済反映の合格を意味しない。

正本SQLを複製せず、以下の単位で**適用前レビューと各段階の停止判定**を行う。括弧内は正本migrationの行範囲の目安であり、単純な行抽出をそのまま実行しない。

1. **商品・基礎スキーマ**: `20261031125930_phase2_product_commerce_v2_20261031.sql` の商品5件、注文/作品のV2列と制約、相談・内訳・キャンペーン・制限表、RLS/権限（4–213行）。TEST Stripe Price IDを確認するまでは商品のPrice IDを割り当てず、Checkoutを閉じる。既存注文に新制約が通ることを事前照合する。
2. **見積・新規注文**: 同ファイルの `get_commerce_v2_quote` と `create_commerce_v2_order`（217–568行）。`20261107160000_interview_support_pay_before_consultation.sql` の最終見積・契約定義を後続で反映する。対象関数のsignature、`request_key_v2` の一意制約、注文58件の不変を確認する。
3. **支払後・ギフト接続**: 同ファイルの `queue_commerce_v2_paid_work`、既存関数への変更、2トリガー（728–976行）。TESTの既存関数との本体差分と旧注文経路を個別レビューしてから置換する。必要な場合だけ `20261107161000_interview_support_link_paid_order.sql` を追加する。追加冊子の関数（569–727行）は初回購入E2Eの依存ではないため別に保留する。
4. **認証引き継ぎ**: `20261107010000_commerce_purchase_handoffs.sql`、続いて同名Edge。TESTサイトのOriginと返却先を確認する。
5. **Checkout・反映**: 新規Checkout Edgeと必要な共有コードを配置。購入V2のCheckout候補は `experience_policy_version` を `2.0`/`2.1` として付け、Webhookと戻り同期は `finalize_experience_order` へ進む。TEST稼働版もこの経路を持つため、**初回購入のE2Eでは既存Webhookを置換しない方針を第一候補**とする。署名・receipt・旧注文処理を保持し、署名付きTESTイベントと戻り同期で実際の互換性を確認する。差分が必要と判明した場合だけ局所変更する。設定が揃うまでV2ゲートは閉じる。

旧クーポンをV2へ拡張する `20261031130003_phase2_commerce_v2_legacy_coupon_mapping_20261031.sql` は、本番の7件という前提がTESTで成立するか不明であり、**このまま適用しない**。割引コード試験にはTEST固有の承認済み対応表を別途確認する。スタッフ向けの `20261031130032_phase2_commerce_v2_staff_scope_20261031.sql` も、本人・ギフトA/Bの初回購入に必要と判定されるまで保留する。

**現時点の停止点:** 現TEST宛先WebhookとEdge secret名は確認できた。残るのは、秘密値を表示しない方法でのStripe test key/署名secretとの一致、直前データの復元可能な保全手段、旧関数の差分レビュー。これらが揃う前にTEST購入DB・Edgeを適用しない。

Supabase DashboardでTESTプロジェクトの定期バックアップを確認した。最新表示は **2026-11-14 15:48 UTC** の物理バックアップで、復元ボタンがある。ただし現在時点の変更は含まれず、PITRは未契約。StorageオブジェクトもDBバックアップの対象外と画面に明記されている。したがって定期バックアップだけを当日変更の完全な復旧策とは扱わない。TESTの購入関連表は適用直前に制限付きの論理スナップショットを追加するか、利用可能な別の新しいバックアップ方法を確保し、件数・復元手順を確認してから適用する。

Stripe Dashboardのサンドボックス商品一覧で、Phase 2 TESTの基本2商品（35,000円・65,000円）が有効な一回限りのJPY価格であることと、既存資料 `docs/phase2-isolated-db-stripe-test-20261029.md` の商品ID・価格IDが一致することを再確認した。追加冊子2種（5,000円・35,000円）と聞き取りサポート（20,000円）も商品一覧にある。旧49,800円商品とローカルE2E用の重複商品が同じ一覧にあるため、価格IDは同資料のPhase 2対応表の5件に限定する。追加3価格の税区分と価格IDは現行画面での再照合が残る。

同資料に記されたWebhook宛先は旧隔離ブランチ `gmyqqcnbuiaghbrxnkaz` であり、今回のTEST `zpswxefgfabzvxdbtyvq` とは異なる。現行Stripe TEST画面には別のアクティブな送信先 `tateito-yokoito-test-commerce-v2` があり、今回のTESTの `/functions/v1/stripe-webhook` に向いている。`checkout.session.completed` など必要な7イベントを購読している。TEST Supabaseには `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`APP_URL`、`EXPERIENCE_COMMERCE_MODE`、`EXPERIENCE_COMMERCE_SUPABASE_URL`、`EXPERIENCE_CHECKOUT_ENABLED` の名前が存在する。ただし秘密値は閲覧せず、対応するtest key/当該送信先の署名secretかは未照合。`COMMERCE_V2_CHECKOUT_ENABLED` は存在せず、Checkout開始前にTESTだけへ設定が必要。Stripe画面では現送信先の過去の失敗配信も表示されたため、有効署名の配信確認を合格ゲートから外さない。古い宛先を今回のTESTへ向けたものとみなさず、秘密値を表示・転記しない。

次の実行順は、(1) 現TEST宛先・秘密設定の存在確認、(2) 直前の制限付きバックアップ取得と復元方法確認、(3) TEST SQLを上記単位で段階適用、(4) TEST Edgeの新規2件だけを配置、(5) 公開見積4ケース、(6) 注文キーと署名付きWebhookの冪等性確認。**実カード試験と別TESTアドレスの登録・ログインは、このゲートを通るまで開始しない。**
