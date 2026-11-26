# BOOK利用者画面の旧配色確認（2026-11-26）

対象は利用者向け画面。管理者画面、公式HP、完成Webブック、家族アプリ本体は今回の旧BOOK配色の対象外。家族アプリの既存の明色UIは維持する。

## 旧配色が残っていた画面群

| 画面群 | 主な実装 | 今回の対応 |
| --- | --- | --- |
| 認証、購入前、無料3問完了、購入完了 | `src/App.jsx` の `Scene_Login`、`Scene_PurchaseStart`、`Scene_TrialComplete`、各完了画面 | 共通の明色スタイルを適用 |
| 制作開始、テーマ案内・完了、質問、録音、語り一覧 | `src/App.jsx` の onboarding、theme、recording、story pages と `src/AnswerTextShared.jsx` | 共通の明色スタイルを適用。録音写真・空の演出は維持 |
| 制作ホーム、本棚への入口、本の仕上げ | `src/home/ApprovedHome.jsx`、`Scene_BookBuilder` | 制作ホームのカードを明色化。仕上げ画面を同じ色体系へ |
| 設定、共有・非公開、プロフィール、通知、サポーター | `src/App.jsx` の各設定画面、`src/LineNotificationConnection.jsx` | 共通の明色スタイルを適用 |
| ギフト受け取り、家族による代理制作、共同管理、家族からの語り | `src/App.jsx` と `src/FamilyStoryInviteFlow.jsx`、`src/FamilyBookFlow.jsx`、`src/ProjectRoleInvitePanel.jsx` | BOOK利用者画面に共通の明色スタイルを適用 |
| ゲスト無料3問、質問依頼、サポーター招待の単独URL | `src/GuestTrialFlow.jsx`、`src/StoryRequestRecipient.jsx`、`src/ThemeMemoryRequestFlow.jsx`、`src/SupporterSms.jsx` | 単独URLにも同じスタイルを適用 |

`src/book-user-light.css` をBOOK利用者画面の共通スタイルとし、普通のUI文字はゴシック体、背景はアイボリー、本文は深緑、主ボタンは緑とした。表示専用の変更で、購入・認証・保存・DBの処理は変更しない。

## 操作できるTESTプレビュー

`/?book_ui_review=index` は架空データで本体のReactコンポーネントを直接描画する。注文・保存・通知を行わない。制作ホーム、開始、無料3問完了、購入完了、ギフト購入完了・受け取り、制作案内・ペース、章・テーマ完了、テーマ案内、保存済みの語り、BOOK仕上げ、設定を個別表示できる。商品選択と注文確認は同じTEST配備の既存ルートへリンクする。

スマートフォン幅で制作ホーム、設定、制作案内、語り一覧、仕上げ、ギフト受け取りの表示を確認。残る制作途中の録音・写真編集、共同管理の実操作、購入の実決済、iPhone実機の確認はこの架空表示では代替できない。レビュー時に別途確認する。

本番には未反映。TEST用画面一覧は `VITE_PUBLIC_TEST_MODE=true` の配備でだけ有効。
