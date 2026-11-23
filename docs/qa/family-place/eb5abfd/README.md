# 家族アプリ・スマートフォン画面確認

対象ソース: `eb5abfd18e24bc5663833e445d4eddada67d5b34`。本番デプロイと同じReact画面をローカルでビルドし、Supabase接続だけを架空のメモリ内データに置き換えて撮影。画像に実顧客データや認証情報は含めない。これは本番DBのE2E検証ではない。

再取得: `node scripts/qa/capture-family-place.mjs`（Playwright と Chrome が必要）。結果は [results.json](results.json)。対応する実装: [家族アプリ](../../../../src/FamilyPlaceApp.jsx)、[人物ページ](../../../../src/FamilyPersonPage.jsx)、[家系図](../../../../src/FamilyTree.jsx)、[BOOK制作ホーム](../../../../src/home/ApprovedHome.jsx)。

BOOK購入導線も同じ架空fixtureで撮影。見積はfixture値（スタンダード35,000円・プレミアム65,000円）で、注文や決済は行わない。

| 画像 | 状態 |
|---|---|
| [01-home.png](01-home.png) | 家族ホーム |
| [02-tree.png](02-tree.png) | 家系図 |
| [03-parent-ring-empty.png](03-parent-ring-empty.png) | 父の年輪・記録なし |
| [04-parent-question.png](04-parent-question.png) | 無料質問・架空の文章回答 |
| [05-parent-ring-saved.png](05-parent-ring-saved.png) | 父の年輪・保存済み |
| [06-parent-shelf-empty.png](06-parent-shelf-empty.png) | 父の本棚・BOOKなし |
| [07-parent-shelf-completed.png](07-parent-shelf-completed.png) | 父の本棚・架空の完成BOOK |
| [08-webbook.png](08-webbook.png) | 固定Webブック・架空の内容 |
| [09-book-production-home.png](09-book-production-home.png) | 既存BOOK制作ホームの実コンポーネント・架空の表示条件 |
| [10-home-book-intro.png](10-home-book-intro.png) | ホームからの共通BOOK紹介 |
| [11-home-book-selection.png](11-home-book-selection.png) | 対象人物を選んだ商品選択 |
| [12-parent-shelf-entry.png](12-parent-shelf-entry.png) | 本棚に戻った状態 |

BOOK制作ホームはコンポーネントの表示・操作確認。実際の購入後ルートへの遷移はこの fixture では検証していない。
