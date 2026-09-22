# BOOKの二つの節目 — TEST適用済み・本番公開保留

## 決定仕様

- はじまりの章 → 九つのテーマ → おわりの章 → 既存BOOK仕上げ。
- 第9テーマとその3問は変更しない。おわりは任意の1問 `TY_CLOSING01`。
- 開始 `TY_ONB04` の質問を「始めることになったきっかけ…」へ更新。任意の話すヒントを併記。
- 質問の `answer_formats` で動画対応を指定。現行BOOKでは上記2問のみ。
- 各節目の現在動画は0〜1本、各300秒まで。動画の連結・合計時間枠ではない。
- 動画がある問いへの動画追加は拒否。語り直しで動画を置換。音声の追加・写真とは別。
- 最終決定：全質問で音声最大5本。対象2問だけ動画各1本を別枠で持つ。動画抽出音声は音声枠に数えない。音声5本でも動画が未使用なら動画追加可、動画があっても音声5本まで追加可。
- 語り直しは現在のメイン回答を置換（写真・共有設定維持）、語り足しは既存本文・音声を残して追加。
- 実画面レビュー承認済み：通常質問も節目も、質問 → 語る画面 → ユーザーが開始 → 確認／保存。遷移だけでは収録開始せず、形式選択専用画面も追加しない。公開flag ONで一括切替。以後、独自判断でUIを追加・変更しない。

## 変更箇所

- `src/lib/bookMilestones.js`: 質問能力判定、形式別空き枠、アップロード予約・再試行・保存。
- `src/BookMilestoneFlow.jsx`: 既存質問・確認画面の再利用、スキップ、静かな着地。
- `src/MilestoneCapture.jsx`: 既存録音画面内で使う音声／動画切替、初期値は音声。動画300秒、音声は既存600秒。二重開始・途中失敗をガード。
- `src/MilestoneVideo.jsx`: 語りと紐づいた動画の署名URL再生。
- `src/App.jsx`: 本人導線、最終テーマ→おわり、語り一覧から再回答／語り直し／語り足し、確認画面内の動画。
- `src/FamilyRecordingFlow.jsx`, `FamilyThemeFlow.jsx`, `FamilyConnectionTest.jsx`, `FamilySubjectStories.jsx`, `home/familyHomeModel.js`, `lib/familyStories.js`: 同じPersonで制作Supporterが利用する導線。
- `supabase/migrations/202609220002_book_milestones.sql`: 新問と能力情報、予約・監査履歴、質問単位の動画上限、保存RPC、Storageの失効制御。既存220001と重複しない番号。

## データ保護

- 既存テーマ、購入、Person、Project、共有設定は変更しない。
- 開始問の回答済み質問文スナップショットは維持。
- おわりの問はテーマを回答／スキップ後に明示的に作成。進行中／完成済み全件へ自動挿入しない。
- 確定済み本のmanifestがある場合、新しい問いを自動追加しない。
- 保存は予約IDで冪等、revisionで競合検知、プロジェクト行ロックで動画枠を保護。
- 置換では現在の関連行を変更するが、旧ファイルを物理削除しない。旧回答・素材の監査スナップショットを非公開テーブルに保存。
- 旧・未関連動画は勝手に削除／移動しない。既存2枠が満杯なら新動画追加を拒否し保持。
- Supporter停止／family gate閉鎖後は新RPCも拒否。置換後の旧actor-prefix動画にもStorageガードを適用。

## 検証済み

- migrationをメタデータ由来のPGlite DBへ適用。既存family SQL 135チェックに続けて新テストを実行。
- 音声初回→動画追加、動画ありの動画追加拒否、動画ありの音声追加、動画置換、301秒拒否、保存再試行、旧ファイル保持、写真・非公開設定維持。
- おわり作成の冪等性、スキップ後の回答、開始・終了で2動画、既存テーマデータ不変。
- 制作Supporterの保存、本人からの停止、停止後アクセス拒否、DB rollout OFFの拒否。
- 単体2件、周辺回帰27件PASS。ビルドは新機能flag OFF／ONで実行。
- ブラウザーで外部通信のない合成fixtureを操作。質問文・ヒント、音声初期値、同一画面動画切替、確認／保存、既存動画あり時の動画追加無効、終了のスキップ、通常質問の切替なしを確認。
- 通常質問で既存のautoStart指定があっても、画面遷移後の収録要求は0回、開始ボタンを押すと1回。節目も音声選択・収録要求0回で待機することを合成fixtureの実画面で確認。
- 合成fixtureのメディアは再生可能な実動画ではない。撮影・文字起こし・注文の実環境E2Eではない。
- 2026-09-22の最新TEST／本番カタログをREAD ONLYで取得し、それぞれのテーブル・関数定義をローカルに再現。このmigration単独の適用リハーサルは両方PASS。顧客データは複製していない。
- リモートTESTに `202609220002` を適用済み。適用前の関数定義のdrift検査とtransaction内の履歴登録を実施。migration SHA256: `ce922af655c374b7b4954a0040b9adca6fa31fb0d56f9c1cd78b542d520bdb78`。
- 実アップロード前に既存Storage予約ガードとの不整合を発見し修正。未確定の動画は、同じactorの未使用・有効期限内予約に限ってアップロード可。認証ユーザーとしてのStorage INSERTと拒否ケースをSQLテスト済み。
- 本番READ ONLY集計: Project 9件、はじまり完了3件、9テーマ進行中9件、9テーマ完了0件、確定BOOK 0件、開始問回答済み1件、既存動画0件。完了済みケースは本番実例がないため、合成DBテストで保護を確認。
- migration前後で既存Project・回答・質問の状態・動画の保護対象値が不変であることをSQLテスト済み。回答済み開始問の質問文は維持し、未回答だけ新文言へ変更。
- TEST専用の実収録確認ページで、実認証・実RPCによるはじまりの問いと収録待機まで確認。音声が初期選択、画面遷移のみではマイク・カメラを起動しない。実機収録・アップロード・再生はまだ未確認。
- `package.json` に型チェック・lintのスクリプトはないため、この2項目はPASSとは扱わない。buildは既存の大きなchunk警告あり、エラーなし。

## 未完了・仕様衝突（Release Gate）

1. 手動開始とプレビューの画面構成はユーザー承認済み。既存の開始動機案内から質問が二重表示されないよう、本アプリ側も承認済みの質問画面に直接接続。
2. 上限の仕様確認は解消済み（音声5本＋対象問の動画1本は別枠）。節目の「語り足す」は録音画面へ進み、サーバーの最新状態に基づいて形式ごとに開始可否を制御。通常質問の既存5本制限は維持。
3. 実iPhone/Safari・Androidで同時audio/video MediaRecorder、5分停止、pause/resume、再生、バックグラウンド中断を確認する。
4. リモートTESTで既存Edgeの文字起こし／整文、Supporterからの写真・編集・BOOK確定・注文まで通す。
5. 既存2本の未関連動画を持つ利用者の運用案内を確認する。自動再分類しない。
6. 監査履歴・置換済み／未保存ファイルの保管期限と削除は本変更に含めない。

## 公開状態

`VITE_BOOK_MILESTONES_ENABLED` は既定OFF。リモートTESTのDBだけ適用済み。本番DB／Edge／フロント／公開フラグは未変更。HP・mainへのpushなし。Family公開gate・allowlist・Cも変更しない。

migrationには既存関数定義の厳密な文字列照合があり、driftならtransaction全体を停止する。本番適用前に最新カタログで再リハーサルすること。実収録のRelease Gateを解消するまでは本番に適用・公開しない。

本番HPには別タスクの更新が入っている。このレビューworktreeのdistをそのまま本番へ公開するとHPを巻き戻すおそれがあるため、公開時は最新HPの変更を維持した統合artifactを作り、差分確認・build・Smokeを再実施する。

## rollback方針

- TEST migrationはtransaction内エラーなら全体rollback。commit後にテーブル削除や顧客データ巻き戻しはしない。
- 本番公開後に問題が起きた場合は機能flag OFFと直前のフロントdeployment復帰を優先し、保存済み素材を保持してforward fixする。flag OFFだけでDBの関数変更まで戻るわけではない。
- 現時点では本番未変更のため、本番rollback操作は不要。

ローカル検証:

```sh
node --test scripts/tests/book-milestones.test.mjs
QA_PGLITE_PATH=/path/to/pglite/dist/index.js node scripts/tests/book-milestones.sql.test.mjs
VITE_BOOK_MILESTONES_ENABLED=true npm run build
node scripts/tests/book-milestones.preview.mjs
```

最後のコマンドはloopback限定の合成データfixture。実アカウントや実ファイルを入力しない。

実収録確認は `node scripts/tests/book-milestones.live-test.mjs`。リモートTESTの専用架空Person／Projectだけを使用し、loopbackに限定する。TESTセッション等はignored `output/` に置き、Gitへ含めない。このQA用ラッパーは製品UIや本番配布物には含めない。
