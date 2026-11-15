# 文章下書きの作品別修正と購入TEST準備（2026-11-15）

対象: `codex/book-answer-shared-design`。本番DB・本番Edge・本番Stripe・mainは変更していない。隔離TESTは Supabase `zpswxefgfabzvxdbtyvq`。購入用の別TESTアドレスでは登録・ログイン・決済をしていない。

## 1. 複数作品の文章下書き

本番と隔離TESTの旧 `answer_text_drafts` 主キーはともに `(user_id, sequence_order)` であり、`book_project_id` 列は存在するが主キーに含まれていなかった。同一利用者の別作品で同じ番号の下書きを独立させられない。加えて、下書きの8関数の検索・更新とブラウザの3つの取得経路に作品IDが不足していた。本番の既存下書き106行はすべて `discarded`、作品IDのNULLは0行。隔離TESTは4行で同じ状態。両環境で他表から下書き主キーへの外部キー参照はなかった。

候補 `supabase/migrations/20261115000200_scope_answer_text_drafts_to_book_project.sql` は主キーを `(user_id, book_project_id, sequence_order)` とし、`sync_answer_text_draft`、`discard_answer_text_draft`、`save_answer_text`、競合解決3関数、写真を伴う確定2関数の対象行を作品IDで限定した。既存の関数シグネチャ・権限・版管理・回答確定の意味は維持する。`src/lib/answerTextDraft.js` のサーバー下書き・競合時回答・競合時下書きの取得にも作品ID条件を加えた。端末側の下書きキーは従来から作品IDを含む。既存回答や写真・音声には更新をかけない。

依存順: `20261114000100_book_answer_photo_drafts.sql` の後に本migrationを適用する。後者が参照する写真確定2関数は、現在の本番にはまだなく、同ブランチの先行migrationにある。既存データを消すロールバックは用意しない。戻す必要があれば、追加された作品別下書きがないことを確認してから旧主キーと旧関数・クライアントを戻す。複数作品の下書きが存在する状態で旧主キーへ戻すと衝突するため、無条件の逆migrationは不可。

| 検証 | 結果 | 範囲 |
| --- | --- | --- |
| 隔離TESTへmigration適用 | **成功** | 初回は関数終端のセミコロン不足でトランザクション全体が失敗し、修正後の再適用に成功。主キーは作品IDを含む。 |
| 既存下書きの保全 | **成功** | TESTの4行と内容ダイジェスト `c19e2304ad7ccec43439b841c61a811a` が適用前後で一致。 |
| 二作品・同一質問番号の下書き | **成功** | 認証ロールとTESTユーザーJWT subjectを使うDBトランザクションで、両作品の6番を別々に同期。片方の破棄後も他方を保持し、他方の正式回答保存後も先の作品の回答は0件。試験トランザクションはROLLBACKし、試験行は残さなかった。 |
| 8関数の旧スコープ残存検査 | **成功** | `user_id + sequence_order` だけの下書き対象操作と旧 `ON CONFLICT` が残らないことを照合。 |
| 認証付き画面E2E | **未実施** | DB RPC・クライアント単体と区別する。複数作品の同番号を画面で再開する試験は本番反映前に必要。 |
| 変更範囲の自動テスト | **成功** | `npm run test:answer-ui` 18/18、`commerce-v2.test.mjs` とcheckout gate 19/19。 |

## 2. HP購入E2E用の隔離TEST差分

現行HPは動画付きV2商品選択、認証引き継ぎ、`create-commerce-v2-checkout` の見積・注文・Stripe開始を通る。無料3問後も同じ購入部品に接続する。本番の商取引定義は**読み取りのみ**で比較した。旧商品・既存注文・TEST注文履歴は保持する。

| 項目 | 本番 | 隔離TEST | 必要な対応 |
| --- | --- | --- | --- |
| V2商品5種 | 35,000円／65,000円、追加2種、聞き取りサポートが存在 | 全5種が欠落、旧49,800円商品等のみ | V2商品をTEST専用価格IDとともに追加。liveのStripe IDをコピーしない。 |
| V2 DB | V2相談・注文内訳・申込制限・キャンペーン対応表、注文・作品のV2列、見積・注文RPCあり | 上記4表・V2列・RPCが欠落 | 既存TEST定義と照合し、必要な依存順で追加。旧注文を更新・削除しない。 |
| 認証引き継ぎ | `commerce_purchase_handoffs` と `commerce-purchase-handoff` あり | 両方欠落 | 購入前後で選択を保持する表・Edgeを追加。無料3問の検証はこの後。 |
| Checkout Edge | `create-commerce-v2-checkout` あり | 欠落 | 候補コードと共有依存をTESTへ配置。JWT設定を本番と照合。 |
| Webhook・戻り照合 | 候補に対応する処理あり | `stripe-webhook` と `sync-checkout-session` は旧版で分岐が異なる | 上書き前にTESTの稼働定義を差分レビューし、必要なV2処理だけを整合させる。署名検証・既存TEST注文を守る。 |
| Stripe・公開ゲート | liveとして稼働 | DB上は `stripe_mode=test`。Edgeのsecret/Stripe側Webhook・商品価格の設定状況は未確認。ローカル `VITE_COMMERCE_V2_ENABLED` も未設定 | TEST用 `sk_test`、署名secret、TEST price IDs、TEST Supabase URL、TEST APP_URLを秘密値を表示せず照合。ゲートは構成と見積が揃うまで閉じたままにする。 |

既存 `20261031125930_phase2_product_commerce_v2_20261031.sql` は約977行で、旧注文表・作品表・複数RPCまで一括変更する。現行TESTはこの前提より古く、既存TESTの関数や注文に対する影響とStripe設定がまだ揃っていないため、この調査段階で全文を適用しなかった。半分だけ有効なCheckoutを公開することも避けた。今回、購入系のDB・Edge・設定変更は**未実施**。TESTの既存データと注文はそのまま。

本人・ギフトA/Bの実決済開始前に共通で必要: V2商品とTEST priceの金額・商品・税・mode照合、Quote RPCの読取、購入引き継ぎ、V2注文RPCと冪等性、Stripe test Webhook署名と戻り照合、TEST専用URLとCheckout gate。本人は未購入の作品と本人認証、ギフトAは購入者・受取人の別TESTアカウントと受取人の購入済み引き継ぎ、ギフトBは購入者・代理制作者権限と正規の制作開始が必要。各経路の支払後には注文・作品・招待・契約を照合し、BOOK完成・公開まで追う。DBで購入済みにした状態や0円確定をStripe実決済の成功として数えない。

**残存リスクと次の判断:** TEST用Stripeアカウントの価格・Webhook・Edge secretを安全に確認できる接続手段が現在ない。これらが揃うまで購入E2E環境の準備完了とは言えず、実決済を開始しない。TESTの旧DB・Edgeを一括で候補へ上書きすると、他のTEST作品と注文への影響が未評価となる。差分・バックアップ・適用順を先に確定し、TEST専用に同期する。今回の文章下書きmigrationは本番未適用であり、main統合・本番デプロイも行わない。
