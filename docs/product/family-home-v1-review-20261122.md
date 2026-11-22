# 家族ホーム Ver1.0 デザイン照合（2026-11-22）

正本: [承認済み10画面](design-references/family-power-v1.0-approved-10-screens.png) の左上1画面。
比較画像: [承認済みと実部品の並列表示](design-references/family-home-approved-vs-actual-20261122.png)。
スマホ基準プレビュー: [PC上でも390×844pxのスマホ枠で表示](design-references/family-home-mobile-preview-20261122.png)。今後のレビューはスマホ表示を先に確認し、PC専用レイアウトは実装段階で整える。

## 今回反映した範囲

- 実アプリの家族ホームだけを `FamilyHome` に切り出し、生成り、深緑、写真ヒーロー、書籍型カード、カードの余白・影、アイコン付き下部ナビを正本に合わせた。
- 初回は人物・BOOK・思い出の架空データを表示しない。人物と無料の語りが増えると、同じホームの人物カードと記録件数に反映する。
- 既存の人物登録、人物ページへの遷移、保存処理は変更していない。家族ホーム以外の画面スタイルは変更していない。
- 家系図・年表・思い出の入口は正本に合わせたアイコンと名称だけを表示する。現段階では押せるようにはしていない。

## 正本と異なる点

- 正本はBOOK完成済みの例。現在の無料ホームはBOOK作品を読み込む実装がなく、初回状態では表紙を表示しない。購入済みBOOKと人物の結合表示は別途接続が必要。
- ヒーローの風景は既存のレビュー用仮素材 `public/previews/family-power-assets/landscape-review.jpg`。正本の写真の切り出しではない。本番素材には利用権を確認した画像を指定する必要がある。
- iPhoneの時計・電波表示はOS表示なのでWeb画面には描画していない。

## 確認入口

- [TEST HTTPS・家族ホーム実部品レビュー](https://tateyoko-book-test-efs78g2wa-tateito-yokoito.vercel.app/family-home-review.html) — PCでも390×844pxのスマホ枠。スマホでは画面幅に合わせる。初回・人物登録済み・記録ありを切り替えられる。架空の人物はブラウザ内の表示用のみでDBに保存しない。
- [TEST HTTPS・承認済みとの並列比較](https://tateyoko-book-test-efs78g2wa-tateito-yokoito.vercel.app/family-home-comparison.html)。
- [TEST HTTPS・認証付き実アプリ](https://tateyoko-book-test-efs78g2wa-tateito-yokoito.vercel.app/?app=family_place) — 同じ `FamilyHome` を実データで表示する。今回、認証付きの登録・保存E2Eは再実施していない。

TESTプレビュー配備ID: `dpl_AGHV8PgTC2qVqTUPv8VCN4do47dh`。`x-tateyoko-environment: test`、noindex、TEST Supabase参照を確認した。本番環境は変更していない。

## 確認結果

- `npm run test:answer-ui`: 18件成功。
- Viteビルド成功。TEST専用ビルドに本番Supabase参照・秘密鍵・管理画面バンドル・ソースマップがないことをビルドスクリプトで確認。
- TEST HTTPSのレビュー画面はHTTP 200。スマートフォン幅390pxのブラウザで空状態と記録あり状態を表示し、風景画像HTTP 200、JavaScriptエラーなしを確認。
- 認証付きTESTの人物登録、無料3問、メディア保存、別ユーザーJWTでの権限境界は今回未実施。既存の無料アプリE2E課題として継続する。
