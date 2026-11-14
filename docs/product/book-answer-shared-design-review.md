# BOOK回答の明色化・共通入力基盤：設計レビュー

**状態：STEP 1・2の設計案。アプリ・DB・Storageは未変更。** 正本は [product-spec.md](./product-spec.md)、[user-flows.md](./user-flows.md)、[design-system.md](./design-system.md)、[acceptance-tests.md](./acceptance-tests.md)。本書は実装計画であり、別の仕様正本ではない。基準画面は [GitHubで開ける回答UIプレビュー](./previews/nenrin-question-answer-seasonal-20261112.html)（2026-11-12時点のローカルFIXプレビューをそのまま保存した疑似動作版）。

## STEP 1：画面と保存経路の棚卸し

| 経路・画面 | 現行配色／部品 | 今回の対象 | 保存・進捗への影響 | 区分 |
| --- | --- | --- | --- | --- |
| はじめの会話の入口・終了 | 暗色。`src/App.jsx` の `Scene_ThemeIntro` / `Scene_StartingConversationComplete` とオンボーディング分岐 | 明色の共通章シェルへ接続。章固有の案内は維持 | 入口の購入済み判定・終了時の `book_projects.onboarding_status` を維持 | A：表示、C：章遷移 |
| 通常テーマ入口・終了・次テーマ案内 | 暗色。`Scene_ThemeIntro` / `Scene_ThemeResume` / `Scene_ThemeComplete` | 明色化し共通章シェルを利用 | `pendingThemeTransition`、追加質問の選択を維持 | A：表示、C：テーマ進行 |
| 問い表示・回答入口 | 暗色。`Scene1_MyPage`、`QuestionFlowTopBar` | FIXプレビューの声／文章／写真入口と全体確認へ | `questionsDB`、`progress.currentIndex`、回答状態の読込。無料3問は既存分岐を維持 | A：入力表示、B：読込、C：質問順 |
| 録音・文字起こし・AI整形 | 暗色。`Scene_Recording` / `Scene3_5_VoiceCheck`。季節側も同じ録音処理を `renderRecorder` で使用し、CSSで明色化 | ロジックと3・2・1を維持して共通の明色ビューに統一 | BOOKは `commit_answer_recording_with_segments` と `answers`、季節は専用RPC。未送信音声に離脱警告 | A：操作、B：保存先 |
| 文章の直接入力・編集 | 暗色。`WrittenAnswerEditor` / `AnswerTextShared`、`AnswerTextDraft` | 共通の入力・全体確認UIへ。自動保存を確定と分離 | BOOKの `answer_text_drafts` と正式回答は別処理。季節は700ms後に `save_seasonal_memory` | A：入力・保存表示、B：保存先・確定 |
| 写真追加・補正・確認 | BOOKは暗色の `PhotoCorrectionFlow` / `Scene_StoryPages`、季節も同じ補正部品を利用 | 問いを開いた時から写真を追加。横スクロールの共通サムネイル | BOOK `photos` + `media_assets`、季節 `seasonal-memory` + `seasonal_memory_media`。登録完了前の確定禁止 | A：表示・補正、B：登録 |
| 回答の全体確認 | BOOKには写真・文章・音声を束ねる同等画面がない。季節は `SeasonalMemoryFlow` の `answer` | 共通の確認画面を採用 | 保存済みの証拠が揃ってから「この問いを終える」を許可 | A：表示、B：確定、C：進捗 |
| 前後の問い移動 | `src/App.jsx` の `goToNextQuestion` と書面保存後の別経路。戻るは `theme_resume` または入口へ | 直前の問いへ戻る。回答済みなら確認、未回答・スキップなら入力 | `profiles.current_sequence` を戻さない。再進行で後続回答を上書きしない | C：BOOK進捗 |
| 問いの一覧・語りを見る・写真から語る | `Scene_QuestionLibrary` / `Scene_StoryPages` / `Scene_PhotoStoryStart` と `FamilyPhotoStoryFlow` | 回答への出入りで暗色に戻る箇所のみ明色化。独立した写真起点の章は維持 | 既存回答の読込・編集、写真起点の章への収録を維持 | A：周辺表示、C：章構造 |

現行の実装差：BOOK文章はローカル下書きとサーバー下書きを同期し、`WrittenAnswerEditor` の「保存する」で正式回答と進捗を更新する。季節は文章を自動保存し、別の「この記録を終える」で確定する。BOOK音声・写真も別の保存経路で、現状の `handleSaveAnswer` は写真の `media_assets` 登録エラーを記録するだけで回答済みに進める。さらに `src/lib/bookEditionAdapter.js` は本文が空のストーリーを除外するため、写真だけのBOOK回答は紙面まで届かない。ここは表示変更だけで済ませない。

## STEP 2：共通化の境界と保存契約

| 区分 | 設計 | 再利用・接続の方針 |
| --- | --- | --- |
| **A：完全共通** | `AnswerInputFlow`（入口・録音中・文章確認・文章入力・写真・全体確認）、明色トークン、録音操作、既存写真補正、横サムネイル、保存状態、未保存検知、離脱警告、失敗・再試行 | 季節の現行明色UIを基準に、既存 `Scene_Recording` / `PhotoCorrectionFlow` の処理を移すことなく共通表示に接続。BOOK用の別の明色画面を増やさない |
| **B：共通インターフェース** | `load()`, `saveDraft(change)`, `uploadMedia(file, kind, stableId)`, `removeMedia(id)`, `complete(expectedRevision)` をBOOK用・季節用アダプターへ委譲 | UIは結果 `serverSavedRevision`, `pendingMedia`, `error`, `retry` を受け取る。BOOKは既存 `answers` / `answer_text_drafts` / `media_assets` / `audio` / `photos`、季節は専用テーブル・RPC・Storageを維持。権限は各接続先で検査 |
| **C：商品固有** | BOOKの問い・スキップ・章遷移・進捗・紙面／PDF／Webブック・完成後固定。季節の1季節1件・期限・自動確定・カギ・記憶のかけら | 共通画面へ `context`, `canComplete`, `nextLabel` 等を渡す。DBテーブルと作品データは統合・移行しない |

**保存状態の一つの基準**：`idle`（未入力）→`saving`→`saved`（全変更とメディア登録をサーバーが確認）／`failed`（再試行可能）／`conflict`（再読込・解決が必要）。端末内だけの下書きは `saved` と表示しない。完了は、内容あり・未送信変更なし・メディア登録待ちなし・保存失敗なし・読み込んだ版とサーバー版の整合あり、のときだけ許可する。重複操作は同じID／版を使って冪等に扱う。確定した回答の再訪では、新規回答を作らず同じ回答を読込む。

**BOOKへの接続順**：まず既存の回答読込・音声処理・写真補正を共通画面に接続し、次に文章・写真・音声の下書きを各アダプターから同じ保存状態へ集約する。正式回答の保存と進捗更新を分離し、確定時に同じ回答IDと版を検証する。BOOK側は写真のみの正式回答とメディア登録の整合をDB/API側まで保証する必要がある。既存 `handleSaveAnswer` の登録エラーを握りつぶす挙動は、確定禁止へ改める。季節側は既存の保存RPCと期限・カギを維持する。

**問いの戻り**：閲覧中の問いインデックスを正式進捗から分ける。次の問いの「戻る」は直前の問いへ。回答済みなら保存済み全体確認、未回答・スキップ済みなら入力、テーマ先頭なら入口。過去の問いから「次へ」は、回答済みの問いを再回答させず読み進める。無料体験・オンボーディング・テーマ追加質問・最終問いの章境界は専用の遷移条件で維持する。

## 変更範囲・移行・リスク

1. `src/App.jsx` の回答・テーマ画面と保存／進捗配線、`src/SeasonalMemoryFlow.jsx`、`src/WrittenAnswerEditor.jsx` / `src/AnswerTextShared.jsx`、`src/seasonal-memory.css` を対象に、共通画面と保存コントローラーを切り出す。録音・文字起こし・AI処理本体、写真補正本体は再利用する。
2. BOOKアダプターを `AnswerTextDraft` と既存の音声・写真経路に接続する。写真のみの回答にはDB/APIの確定条件・メディア登録整合が必要。DB変更は既存スキーマとの照合後に最小限で追加し、既存回答の一括移行はしない。
3. `src/lib/bookEditionAdapter.js` の本文空フィルターと紙面・PDF・Webブックの出力を、写真のみ回答も題名／質問と写真で成立する形に揃える。既存の本文あり回答の版と掲載順は変えない。
4. 変更した接続点を中心にBOOK・季節・無料3問・ギフト権限を検証する。API/DB/Storageと出力物は隔離環境の架空データで確認する。main統合と本番反映は別途承認待ち。

**主要リスク**：BOOKの文章下書きと正式回答の二重経路、音声を含む未送信データの離脱、写真登録後の部分失敗、過去の問いの再編集が進捗や後続回答へ影響すること、写真のみのBOOK原本・公開版の不一致、既存の制作権限／非公開情報保護。これらは画面の共通化だけで解消したとみなさない。

**レビュー時に確認する判断点**：共通画面の基準はFIX済み季節の明色プレビューとし、BOOKの既存録音・写真補正ロジックを維持する。この選択は既に合意済み。大幅なUX変更が必要と判明した場合は実装前に提示する。写真だけのBOOK回答が出力・版管理まで成立することは受け入れ条件であり、省略しない。
