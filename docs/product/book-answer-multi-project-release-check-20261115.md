# 複数作品の録音確定・購入主導線の追加検証（2026-11-15）

対象ブランチ: `codex/book-answer-shared-design`。本番DB・本番Edge・mainには変更を加えていない。以下の「隔離TEST」は Supabase project `zpswxefgfabzvxdbtyvq` を指す。テスト作品・テスト利用者のみ使用した。

## 録音確定の最小修正

本番DBを読み取り専用で照合した結果、`answers` は `(book_project_id,user_id,sequence_order)` に一意制約があり、作品IDがNULLの旧回答だけ `(user_id,sequence_order)` の部分一意制約を持つ。一方、`commit_answer_recording_with_segments` は既存回答を `user_id + sequence_order` のみで探していた。複数作品の同番号質問では別作品の回答を拾い、正常な録音確定を `answer_conflict` にしていた。

`supabase/migrations/20261115000100_scope_recording_commit_to_book_project.sql` はこの検索条件に `book_project_id=t.book_project_id` を追加する。既存関数の引数・権限・版管理・再送判定・音声登録は維持し、表、インデックス、回答行には触れない。文章・写真・季節の各経路もこのmigrationでは変更しない。

反映前の本番 `pg_get_functiondef` を再取得し、関数本文を空白正規化したうえで候補と比較した。候補本文は、上記の検索条件1か所を除き本番定義と一致した。本番では読み取りだけ行い、候補を適用していない。

隔離TESTは本番と違い、全作品を通じて `(user_id,sequence_order)` を一意にする旧制約が残っていた。隔離TESTでのみ、その制約を外し、本番と同じ旧回答用の部分一意インデックスを追加してから候補関数を適用した。既存回答行は更新していない。このTEST専用の制約整合を本番migrationに含めない。

| 確認 | 結果 | 証跡・範囲 |
| --- | --- | --- |
| 同一利用者の別作品、同じ質問番号の録音確定 | 成功 | 隔離TESTで別作品に回答5番がある状態から、対象作品の既存 `planned` attempt を認証ロール・JWT subjectのDB RPCで確定。別の回答ID・revision 1・音声1件になった。 |
| 同じattemptの再送 | 成功 | 同じ回答ID・revision 1、`already_committed=true`。二重登録なし。 |
| 同じ質問への別attempt | 成功 | `answer_conflict` を返し、revision 1を維持。 |
| 実際の認証付き画面・Storage・録音アップロードの通し | 未実施 | 上記はDB RPCであり、HTTP認証付き実画面E2Eとは区別する。 |

季節の境界・確定など既存の対象テスト `node --test scripts/tests/seasonal-memory.test.mjs` は6/6成功。共通録音部品の認証付き季節録音試験とは区別する。新migrationと適用元の関数定義を比較すると、説明コメント以外の差分は既存回答の作品ID条件1か所のみだった。

**残る別件:** `answer_text_drafts` の主キーと `sync_answer_text_draft` / `save_answer_text` の回答検索は現在も作品IDを含まない。同一利用者が複数作品の同番号質問に文章を保存すると競合し得る。録音関数の修正では悪化も解消もしない。購入からBOOK完成までの複数作品を正式に支える前に、別の最小migrationと実画面検証が必要。既存データを確認せずに主キーや関数を変更しない。

## HP起点の購入E2Eの環境確認

隔離TESTの既存本人アカウントは公開済み作品のホームに入るため、未購入者の購入開始試験には使えない。別のTEST用メールアドレスを確認済みだが、登録・決済操作は未実施。

現時点の隔離TESTには、正規の新購入導線が呼ぶ `commerce-purchase-handoff`、`create-commerce-v2-checkout` のEdge Functions、`commerce_purchase_handoffs` 表、`get_commerce_v2_quote` と `create_commerce_v2_order` のDB関数が存在しない。ローカル環境でも `VITE_COMMERCE_V2_ENABLED` は未設定。したがって、このTESTで現行のHP商品選択→認証→見積→Stripeの実E2Eを完了したとはいえない。旧Checkout、DB上で購入済みにした作品、0円BOOK完成を、今回のStripeテスト決済の代わりには数えない。

| 経路 | 現状 |
| --- | --- |
| HP本人購入→制作→完成→公開 | 実Stripeテスト決済からの通しは未実施。既存のBOOK制作・0円完成・公開の部分検証は別記録にある。 |
| HPギフトA→受取人制作→完成→公開 | 実Stripeテスト決済と受取人の購入済み引き継ぎは未実施。無料3問・再購入案内へ戻らないことは未確認。 |
| HPギフトB→代理制作→完成→公開 | 実Stripeテスト決済からの通しは未実施。既存の家族制作作品での回答保存だけは別記録にある。 |
| 季節の共通録音部品 | 今回は関数の録音回答検索のみ変更。季節の認証付き録音回帰は未実施。既存季節の新規文章保存・再開・確定は別記録で成功。 |

最短の次手は、現在の購入候補コードに必要なTEST専用DB・Edge・Stripe test設定を本番と切り離して揃え、未購入TEST利用者で本人・ギフトA・ギフトBの実決済を順に行うこと。既存のTEST決済・Webhook履歴は消さず、デプロイ前に現行定義と秘密情報の設定を照合する。環境差分の範囲が拡大する場合は、同じ失敗を繰り返さず阻害要因として報告する。
