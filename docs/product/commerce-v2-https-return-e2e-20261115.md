# 購入V2・TEST HTTPS入口と決済後復帰（2026-11-15）

対象: `codex/book-answer-shared-design`。隔離TEST Supabase `zpswxefgfabzvxdbtyvq`、TEST専用Vercel `tateyoko-book-test`、Stripe TESTのみ。本番HP・DB・Stripe、mainは変更していない。既存の決済済み3注文を保持し、追加のCheckout・決済は行っていない。認証コード、Checkout session ID、受取リンクは記録しない。

## 今回確認したこと

| 項目 | 結果 | 証跡・範囲 |
| --- | --- | --- |
| HP購入ボタン → 共通商品選択 | **成功** | TEST HTTPSのHP上部「商品を選んで購入する」を操作し、`/?app=1&entry=purchase` の動画付きV2選択画面へ遷移。スタンダード35,000円、プレミアム65,000円、追加冊子と聞き取りサポートの税込見積を表示。HPの商品説明セクション内の購入ボタンも同じURLを指す。 |
| TEST候補のHTTPS配信 | **成功** | Vercel TEST専用プロジェクトのデプロイ `dpl_7aCfPm92pkkjqwnQYP1Cv1jTmhgT` がReady、固定URL `https://tateyoko-book-test.vercel.app/` に反映。`X-Tateyoko-Environment: test`、`noindex`、TEST SupabaseへのCSP接続先を確認。 |
| HPの商品説明・動画 | **成功** | TEST静的ビルドに既存の埋め込みHTML・CSS・動画だけを追加。埋め込みが実画面で表示され、関連HTML・JS・CSS・動画がHTTP 200。TESTのframe-ancestorsは本番ビルドと同じ`'self'`。 |
| Checkout戻り先と候補画面 | **URL一致** | TEST `APP_URL` は既存計画で固定TEST HTTPSに一致。`create-commerce-v2-checkout` は同URLへ `entry=purchase&checkout=success&session_id=…` を返す。前回のギフトB決済済み戻りURLをSafari履歴から開き、今回のTEST候補画面が表示された。 |
| 決済後の自動ログイン復帰 | **未完了** | 前回の3件はローカル候補画面から決済したため、TEST HTTPSには購入者セッションがない。既存のギフトB決済済み戻りURLは正しく認証画面に到達したが、TEST Authが認証メール送信の一時的な回数制限を返した。認証後の同期・購入済み作品への自動復帰は未確認。回数制限中に再送しない。 |
| 本人・ギフトA・ギフトBの無料3問／再購入への逆戻り | **既存ローカル実画面は成功、HTTPS自動復帰は未実施** | 先行証跡 `commerce-v2-stripe-test-e2e-20261115.md` では3経路の購入済み制作開始まで成功。今回はHTTPS上でログイン後の各経路を通し確認できていない。 |

## 購入済み3作品と完成導線

TEST DBを読み取り照合した結果、本人1件・ギフト2件の注文はいずれも`paid`、作品は各1件で`active`。本人作品は`paid`、ギフトA/B作品は`gifted`。ギフトAは受取人所有、ギフトBは購入者所有で、その購入者に`facilitator`の有効な制作権限と`can_build_book=true`がある。今回の3作品は正式回答が0件のため、仕上げ・公開の実行条件はまだ満たさない。別の隔離TEST架空作品では回答→紙面→実PDF→公開Webブックの接続が成功しているが、今回の3作品から完成・公開した結果ではない。ギフトAの受取人所有者による最終完成と、ギフトB管理者による最終完成・公開は未検証として残す。

## 結論と次のゲート

現在のTEST HTTPSはHP入口・商品選択・Checkout戻りURLの同一ドメイン化まで確認済み。**購入者が同じHTTPSドメインでログインしたままCheckoutへ進み、Stripeから戻って作品へ自動復帰する実画面E2Eは未合格**。Authの送信制限が解消した後、まず既存の決済済みセッションを再表示して認証後同期を試す。既存セッションでは連続したブラウザ復帰を実証できない場合、追加TEST決済が必要な理由と対象経路を先に報告する。二重注文を避けるため再試行前にStripeとDBを照合する。

ローカルで購入・ギフトモード・商品価格・完成権限に関する対象テスト26件は成功。今回の配信前後にTEST DBの購入済み3注文・作品を読み取り確認し、注文・作品・Webhook履歴・Storageを削除していない。main統合・本番反映は引き続き承認待ち。
