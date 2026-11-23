# 家族アプリからBOOK制作までの現行導線（2026-11-23）

## 調査の範囲と判定

現行コミット `d7f0d2c` のReact・Edge Function・SQLマイグレーションを読み取り確認した。今回は画面操作、注文作成、決済、DB変更、デプロイを実施していない。以下の「コード上存在」は実稼働の保証ではない。過去の実機確認では、デモ③で既存BOOK制作ホームまで、デモ④で本棚から完成Webブックまで開けている。ただし、家族アプリからの**新規購入一連のE2Eは未確認**。

| 対象・現在の画面名 | URL・ルート | 画面上のボタン名 | 押下後の遷移先 | 関連する実装ファイル | 実装状況 | 問題点 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. 家族ホーム | `/?app=family_place` | 「自分・家族を登録する」「家系図」、人物カード | 登録・家系図・人物ページ | `src/main.jsx:104`, `src/FamilyHome.jsx:18`, `src/FamilyPlaceApp.jsx:798` | コード上存在 | BOOK商品紹介・新規購入・制作再開への入口なし。 |
| 1. 人物ページ・年輪 | `/?app=family_place&person=<人物UUID>&tab=ring` | 「最初の語りを残す」「新しい語りを追加する」 | 質問一覧を展開し、無料質問へ | `src/FamilyPersonPage.jsx:76`, `src/FamilyPlaceApp.jsx:803` | コード上存在 | 無料記録からBOOK購入への導線なし。 |
| 1・8. 人物ページ・本棚 | `/?app=family_place&person=<人物UUID>&tab=books` | 完成作品の「Webブックを読む」 | `/?voice=<公開ID>&family_shelf=<人物UUID>&origin=<home|tree>` | `src/FamilyPersonPage.jsx:92`, `src/lib/familyPlaceData.js:20`, `supabase/migrations/20261122045654_family_place_person_books.sql:5` | 動作確認済み（デモ④の完成作品閲覧） | 本棚は公開済み作品のみ表示。未購入・制作中作品の入口はなく、空状態は「まだありません」のみ。 |
| 2. 旧BOOKの商品選択 | `/?app=1&entry=purchase`（Commerce V2有効時） | 「自分の人生史」「大切な方へ贈る」「スタンダード」「プレミアム」「購入手続きへ進む」 | `/?app=1&entry=purchase&purchase_review=1&purchase_handoff=<token>` | `src/main.jsx:141`, `src/PurchaseSelectionEntry.jsx:6`, `src/CommerceV2Purchase.jsx:230` | コード上存在 | 家族アプリからのリンクなし。選択値・ハンドオフトークンには家族アプリの人物UUID/対象作品IDがない。一般HPの本番購入CTAは `/early-access/`。 |
| 3. プラン・制作方法の選択 | 同上 | 「スタンダード」「プレミアム」「聞き取り制作サポートを選ぶ」 | 同画面で見積更新後、最終確認へ | `src/CommerceV2Purchase.jsx:260`, `src/CommerceV2Purchase.jsx:291`, `supabase/functions/create-commerce-v2-checkout/index.ts:35` | コード上存在 | 価格はサーバー見積を使用。家族の人物向け「本人制作/代理制作」をこの段階で直接選ぶ仕組みはない。 |
| 4. ギフト・代理制作・聞き取り分岐 | 同上 → 購入結果画面 | 「大切な方へ贈る」→「あなたのスマホ」「贈り先の方のスマホ」／「事前相談フォームを開く」 | ギフトは購入後の受取・代理制作フロー、聞き取りは相談・スタッフ待ちへ | `src/CommerceV2Purchase.jsx:240`, `src/CommerceV2Purchase.jsx:246`, `src/CommerceV2Purchase.jsx:294`, `src/App.jsx:8415`, `src/App.jsx:1435` | コード上存在 | ギフト注文は注文時点でBOOK作品IDを持たず、受取/代理制作の後続処理で作品を作成・紐づける。既存の家族人物UUIDを指定する導線はない。 |
| 5. 認証・注文内容の最終確認 | `/?app=1&entry=purchase&purchase_review=1` | 旧BOOK認証（メール/LINE、デモ用パスワード）→「お支払いへ進む」 | `create-commerce-v2-checkout` → Stripe Checkout | `src/main.jsx:56`, `src/App.jsx:8214`, `src/CommerceV2Purchase.jsx:318`, `supabase/functions/create-commerce-v2-checkout/index.ts:179` | コード上存在 | 同一Supabaseセッションは使えるが、旧BOOKの `ensureUserFoundation` は本人の人物と作品を選択/自動作成するため、家族アプリで選んだ親等には自動接続されない。 |
| 5. 決済完了・購入結果 | Stripe → `/?app=1&entry=purchase&checkout=success&session_id=...` | 「続ける」等 | `sync-checkout-session` で注文確定後、旧BOOKのオンボーディング/制作ホームへ。聞き取りはスタッフ連絡待ち | `supabase/functions/create-commerce-v2-checkout/index.ts:284`, `src/App.jsx:6670`, `src/App.jsx:8391`, `supabase/functions/sync-checkout-session/index.ts:20` | コード上存在 | Stripe、V2決済、旧決済、DBの販売モードの各ゲートがある。現在の本番で新規決済を通せるかは今回の静的調査では不明。 |
| 6. 購入済みBOOKの制作・再開 | `/?app=1` の旧BOOKアプリ内（scene=`home`、`book_builder`、共同制作用 `support_project_home`） | 制作ホームの進行・「本に仕上げる」等 | 回答・テーマ・紙面確認・BOOK完成処理へ | `src/App.jsx:2187`, `src/App.jsx:9088`, `src/App.jsx:9559`, `src/App.jsx:17173` | 動作確認済み（デモ③の制作ホーム到達） | 家族アプリの人物ページ/本棚から、対応する購入済み作品を指定して再開するリンクがない。 |
| 7. 人物IDとBOOK作品ID | `persons.id` ↔ `book_projects.subject_person_id` | 該当なし | `book_projects.id` を注文 `commerce_orders.book_project_id` に渡す | `src/App.jsx:1570`, `src/App.jsx:1600`, `supabase/migrations/20261031125930_phase2_product_commerce_v2_20261031.sql:362`, `supabase/functions/create-commerce-v2-checkout/index.ts:181` | コード上存在 | スキーマ上の紐づけは既にある。問題は「選択中の家族人物→対象BOOK作品」の購入前・認証後の受け渡し。 |
| 8. 完成BOOK・公開Webブック | 本棚 → `/?voice=<公開ID>`、印刷QRも公開IDへ直接 | 「Webブックを読む」 | 既存Webブック。家族本棚から開いた時だけ本棚への戻り先を設定 | `src/main.jsx:175`, `src/FamilyPersonPage.jsx:102`, `supabase/migrations/20261122045654_family_place_person_books.sql:5`, `src/PublishedWebBook.jsx:14` | 動作確認済み（デモ④） | 対象人物IDに結びついた公開作品は本棚へ自動反映する。未公開・制作中は本棚RPCに出ない。印刷QRの既存導線は保持すべき。 |
| 9. 家族アプリ↔旧BOOKアプリの認証・遷移 | `/?app=family_place` ↔ `/?app=1` | 家族アプリ側にBOOK遷移ボタンなし | 同一サイト・同一Supabase Authセッションを使用 | `src/main.jsx:3`, `src/main.jsx:104`, `src/FamilyPlaceApp.jsx:318`, `src/App.jsx:10064` | コード上存在 | 家族アプリは別途 `family_place_access_allowed` で限定公開。旧BOOK側のメール/LINE認証とデモ用パスワードは維持されるが、画面間の人物・作品コンテキストは渡らない。 |

## 現状の「家族アプリから新規購入」

**現在、家族ホーム・人物ページから新規購入へ進む画面遷移はない。** 本棚は公開済みWebブック専用で、未購入時に購入ボタンを出さない。手動で既存の `/?app=1&entry=purchase` を開けば、商品選択 → 認証/購入内容引継ぎ → 最終確認 → Stripe → 旧BOOK購入結果 → 制作へ進むコードはある。ただし、これは家族アプリで見ていた人物を対象にした経路ではない。旧BOOK側の通常初期化はログインユーザー本人の `self` 人物に紐づく作品を探し、なければ本人用作品を作る（`src/App.jsx:1470-1620`）。そのまま購入すると意図しない人物のBOOKを購入するリスクがあるため、現状のURLを人物ページへ単純に貼るのは不可。

また、本番HPの公開CTAは `src/lib/publicPurchaseCta.js:3` で `/early-access/` に向けられている。V2の購入画面と決済処理は再利用可能な実装だが、決済Edge Functionは `COMMERCE_V2_CHECKOUT_ENABLED`、既存Checkoutゲート、Stripeモード、DB販売モードを確認する。現在の設定値は今回確認していないため、**本番決済可能とは判定しない**。

## 既存機能を再利用する最小改修案

1. 家族アプリの選択中人物から、購入済み/制作中/未購入の作品状態をサーバー認可付きで取得し、本棚に「制作を再開」または「BOOKをつくる」を出し分ける。家族ホームからの入口を設ける場合も、先に人物を確定させる。
2. 未購入の場合は、権限確認のうえその人物に対応する既存 `book_projects` を再利用し、必要時だけ通常の作品作成経路で作る。人物UUIDと作品UUIDを、商品選択→ハンドオフ→認証→最終確認まで引き継ぐ。現行の購入選択値・ハンドオフは人物/作品IDを保持しないため、ここが主な接続点。ブラウザのURL/LocalStorageだけを信頼せず、注文時にサーバー側で作品の対象人物・家族内権限・購入者を再検証する。
3. 購入UI、サーバー見積、`create-commerce-v2-checkout`、Stripe、`sync-checkout-session` はそのまま再利用する。購入完了後は返却された `book_project_id` の旧BOOK制作ホームへ進める。ギフト・代理制作・聞き取りは既存の分岐/同意/相談フローを保ち、家族人物との接続方法だけを別途明確にする。
4. 制作中は既存BOOK作品をIDで再開し、完成後は既存の公開・本棚RPCで対象人物に表示する。既存の公開Webブックと印刷QRのURL・固定内容は変更しない。

**先に確定すべき商品判断:** 親の人物ページで「BOOKをつくる」を押した場合、既存商品選択の「自分の人生史」ではなく、原則ギフト/代理制作へ誘導するか、家族が本人の作品を直接購入する新しい扱いを認めるか。現行の自己購入は対象作品を所有する本人、または条件を満たす家族サポーター向けで、既存のギフト/代理制作とは注文時の作品紐づけが異なる。これを決めずに購入ボタンだけ接続すると、同意・作品所有・課金対象がずれる。
