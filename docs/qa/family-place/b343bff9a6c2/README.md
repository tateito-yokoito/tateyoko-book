# 家族アプリ・スマートフォン画面確認

対象ソース: `b343bff9a6c2eb19f5e58c9ad02a527e62fc6ffe`。本番デプロイと同じReact画面をローカルでビルドし、Supabase接続だけを架空のメモリ内データに置き換えて撮影。画像に実顧客データや認証情報は含めない。これは本番DBのE2E検証ではない。

再取得: `node scripts/qa/capture-family-place.mjs`（Playwright と Chrome が必要）。結果は [results.json](results.json)。対応する実装: [家族アプリ](../../../../src/FamilyPlaceApp.jsx)、[人物ページ](../../../../src/FamilyPersonPage.jsx)、[家系図](../../../../src/FamilyTree.jsx)、[BOOK制作ホーム](../../../../src/home/ApprovedHome.jsx)。

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

BOOK制作ホームはコンポーネントの表示・操作確認。実際の購入後ルートへの遷移はこの fixture では検証していない。
