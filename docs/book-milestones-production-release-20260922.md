# BOOK節目・収録の本番反映結果 — 2026-09-22

## 公開結果

- 公開URL: https://www.tateito-yokoito.jp/
- 実装commit: `979ef084f5e9cbcbc056bdab1c14b9ad1eae65e0`
- 配信source commit: `2e7746d24796f647a5473efc26491358821db8a8`
- Deployment: `dpl_7AuC65JiBuKitZfFFYvFmpWf562B`
- Deployment URL: https://tateyoko-book-h5jpoagif-tateito-yokoito.vercel.app
- 直前deployment（復帰先）: `dpl_Cvj7aewBWvvQjmXZP5PHrqnQG3qt`
- JS: `index-BL33-Z3A.js`、CSS: `index-BUa2R2Y_.css`
- 本番URLでHTTP 200、新asset、`X-Robots-Tag: noindex, nofollow`、deployment IDを確認。

ユーザーによる模擬UI承認、その後の実収録TESTの「動作は問題なし」を受けて公開。追加のUI変更・商品仕様変更は行っていない。

## DB / 既存データ

適用したのは `202609220002_book_milestones.sql` の1本だけ。
SHA256: `ce922af655c374b7b4954a0040b9adca6fa31fb0d56f9c1cd78b542d520bdb78`

- はじまり第4問の文言・ヒント・動画対応情報を更新。回答済み質問文は保持。
- おわり1問をカタログへ追加。既存Projectへの一括質問追加や進捗リセットはしない。
- アップロード予約・非公開履歴・atomic保存RPC・質問別の動画枠と5分制限を追加。
- 動画予約のStorage認可を既存の制御と整合。匿名RPC・内部テーブル直接アクセスを拒否。
- 本番直前の9Project、はじまり完了3件、9テーマ進行中9件、開始問回答済み1件、動画0件をREAD ONLY確認。
- 現行229関数とmigration履歴を照合してからtransaction内で適用。
- Project・回答・素材・動画・購入・契約・BOOK manifest・Supporter関係・了承・質問の保護対象値・rolloutの11集合をDB内のハッシュで前後照合。すべて不変。予定した開始問の能力情報／未回答文言変更だけを比較対象から除外。
- 完了済み利用者・既存動画の本番実例は0件。これらは合成DBテストで保護を検証しており、本番実データでの確認とは区別する。

## フロント / Edge / 設定

- 通常質問も手動開始。節目2問のみ同じ収録画面内で音声／動画。音声5枠＋各節目動画1枠。
- おわりを任意回答として既存BOOK仕上げへ接続。
- 公開中HP `9b6cd1a` を統合。LandingPage、landing.css、WebBook表示見本、index.htmlは同commitと差分なし。未公開HP案は含めない。
- `VITE_BOOK_MILESTONES_ENABLED=true`。その他の既存設定を保持。
- DB family rollout OFF、allowlist 0、subject connection/C OFF。
- Family frontend flag OFF、Family server flag未設定=OFF。
- 対象Edge8本の版・verify_jwt・hash、環境設定名は適用前と同一。今回Edgeの更新なし。
- mainへのpush、先行利用者登録、家族公開は行っていない。

## テスト

- 単体・関連回帰29件PASS（前段）。統合後、直接関連12件を再実行してPASS。
- PGlite: 既存Family SQL 135チェック＋節目スイートPASS。動画初回／追加／置換、音声5枠、動画1枠、301秒拒否、同時更新・冪等、共有維持、停止後拒否、Storage認可、既存進捗保護。
- 最新本番カタログからのmigration適用リハーサルPASS。
- 機能ON／OFFのbuild、公開用統合build PASS。既存chunkサイズ警告あり。専用typecheck/lintはpackage.jsonに未設定。
- 模擬ブラウザー: 通常／節目の画面枚数、音声初期値、動画切替対象、語り足し・語り直し・スキップ。
- 実収録TEST: ユーザーから動作確認済みの報告を受領。
- 本番候補: HP画像欠損なし・横溢れなし、ログインフォーム・購入入口・無料3問入口、JSエラーなし。
- 公開後: HTTP・asset・deployment照合。既存本人アカウントのホームと既存の「届いた問いから語る」入口が表示されることを確認。顧客の代わりの録音・保存・注文・決済は行っていない。
- DB後検査: 匿名RPC 401、内部2テーブルRLS ON／authenticated直接SELECT不可、おわりの既存user_questionsへの一括挿入0。

## 残る検証範囲

実機種別のiPhone/Safari・Android、5分実時間停止、バックグラウンド中断の網羅的な独立証跡は未取得。ユーザーの動作確認を、これらすべての個別自動テストPASSとは記録しない。
新節目を含むSupporterの完成・注文全工程は今回未再走。Family gateは引き続き閉じている。
旧素材・未保存アップロードの物理削除と保管期限は本変更に含めない。

## 復帰方法

通常はデータを保持してforward fix。フロント障害なら直前deploymentをVercelでpromoteし、機能flag OFFの旧フロントへ戻せる。DBテーブル・保存素材は削除しない。フロント復帰はDB関数変更のrollbackではないので、DB認可等の異常なら必要な最小修正を別transactionで行う。

証跡はignored `output/book-milestones-production-release/` と `output/book-milestones-release-preflight/`。秘密値・QAセッション・顧客本文はコミットしていない。公開後の追加仕様変更はせず、本反映で区切る。
