# 代表者向け TEST HTTPS 実機レビュー案内（2026-11-15）

対象コードは `24fa253`、配信先は隔離TEST専用 `https://tateyoko-book-test.vercel.app/`。Vercel 配信 ID `dpl_DM1pZkczCqZMqvs7JBG8XbL9GjvC` は Ready。HTTP 200、`X-Tateyoko-Environment: test`、`noindex`、TEST Supabase への接続設定を確認した。本番HP・DB・Stripe、`main` は変更していない。追加決済・新規作品作成は行っていない。

| 確認する体験 | 最短の入口 | 今回の状態 |
| --- | --- | --- |
| HPから商品購入画面 | [TEST HP](https://tateyoko-book-test.vercel.app/) の「商品を選んで購入する」→動画付き商品選択。直接入口は [TEST商品選択](https://tateyoko-book-test.vercel.app/?app=1&entry=purchase)。決済ボタンは押さない。 | HP→同一の商品選択は先行HTTPS実画面で成功。今回の配信はHTTP/ビルド確認。 |
| BOOKの質問回答 | [TESTアプリ](https://tateyoko-book-test.vercel.app/?app=1) で購入済みTESTアカウントとしてログイン→「ご自身の物語を語る」→制作中の作品→「次の問い」。声・文章・写真・AI整形を確認。 | 実データ経路の先行E2Eは成功。今回のHTTPS配信後の認証付き実機操作は未実施。 |
| BOOK紙面プレビュー | 同じ制作中作品のホーム→「本に仕上げる」→「紙面プレビュー」。既存の[写真だけの実PDF証跡](book-answer-e2e-evidence/test-photo-only-proof.pdf)も参照可能。 | 写真だけの回答を含むB5紙面と実PDFは先行E2Eで成功。今回のHTTPS配信後の再操作は未実施。 |
| Webブック閲覧・音声再生 | [音声付きTEST Webブック](https://tateyoko-book-test.vercel.app/?voice=cd4e34988e1873a78125771ca2c54a9167f3459e98650a29)→「声で、この人生を辿る」。[写真だけの回答を含むTEST Webブック](https://tateyoko-book-test.vercel.app/?voice=a80a986d247b660ac11d008ccab740f25875c9a0d0040692)も閲覧できる。 | 今回のHTTPS配信後に音声付き版で再生進捗を実画面確認。写真付き版はHTTP 200を確認、公開内容の先行E2Eは成功。 |
| 季節の記憶箱・記憶のかけら | [TESTアプリ](https://tateyoko-book-test.vercel.app/?app=1) に公開済み作品の本人TESTアカウントでログイン→ホームの「記憶のかけら」。 | 先行E2Eで本人の記録・再読込・確定・閲覧は成功。現在の本人TEST作品では今季の箱が確定済みのため、同じ箱への新規記録は仕様上できない。今回は閲覧のみ案内する。 |

認証コード・決済情報・決済済みCheckout URLは案内文に含めない。購入前のアカウントでログインすると無料3問に入る場合があるため、BOOK回答は購入済みTESTアカウントを使う。既存作品のデータはレビュー中に変更され得るため、回答の確定・BOOK完成・記憶箱の新規記録を行うときは対象作品を確認する。

## ギフトBの決済済み復帰

購入者の認証済みセッションは現時点で利用できず、Safariプライベートウインドウはロックされていた。TEST Authの認証メール送信制限中は再送しない。認証できるようになったら、Safari履歴の**既存の決済済みギフトB戻りURL**を購入者で一度だけ開き、制作管理ホームへ自動復帰すること、再読込後も同じ作品であること、無料3問・再購入・再受取案内へ戻らないことを確認する。修正コードの対象自動テストは先行して通過しているが、この実画面E2Eは未完了。

## レビューの限界

- 今回の目的は代表者による画面・操作レビューの準備。認証付きのBOOK回答・紙面・季節記録は先行TEST実画面証跡を再利用しており、今回のHTTPS配信後にすべて再実施したという意味ではない。
- 今季の記憶箱で新規記録を代表者が試すには、既存の公開済み作品で未確定の箱と正規本人セッションが必要。現在確認済みの本人作品は確定済み。新規作品作成や既存記録の解除は行っていない。
- HPからTEST Stripeへの新規Checkout、ギフトBの認証後自動復帰、今回購入した3作品の完成・公開は未実施。追加決済は行わない。

詳細な先行E2Eは [BOOK回答](book-answer-real-screen-e2e-20261115.md) と [購入HTTPS復帰](commerce-v2-https-return-e2e-20261115.md) を参照。
