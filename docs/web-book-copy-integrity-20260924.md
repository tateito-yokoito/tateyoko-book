# Webブック素材コピーの再実行・並行処理安全性（2026-09-24）

本番変更なし。修正対象は `publish-voice-edition` と共通コピー処理。TEST Edgeだけ更新した。今回の修正に追加DB migrationはない。前回の素材認可migration 001/002は別途、本番反映待ちのまま。

**判定：CONDITIONAL GO（本番未反映）**。今回のcleanupリリースブロッカーはTESTで解消。既知のブロッカーは残っていないが、下記未確認QAと本番反映直前の照合・別途承認は残る。

## 旧挙動と新挙動

旧実装はコピー済みpathを記録し、失敗時にStorageから削除していた。DBがcommit済みでも応答喪失や例外で失敗扱いになり、正式参照中の素材を削除し得た。並行実行でも同じdestinationを別リクエストのcleanupが削除し得た。

新実装では失敗時のStorage自動削除を廃止した。削除／上書き／削除して再コピーは行わない。認可RPCが明示的にtrueだったsourceだけが共通コピー処理へ進む。音声・語り足し・写真・動画・動画付属素材・表紙の既存preflightは維持し、認可の緩和はしていない。

同一candidateの同一素材は同じdestinationを使用する。sourceとdestinationをストリームで読み、SHA-256とバイト数を比較する。destinationがなければコピー、存在して一致すれば再利用、不一致／読取失敗／判定不能はfail-closed。サイズだけの一致では再利用しない。検証結果はsnapshot metadataのcopyIntegrityへ保存する。

## DB境界と再実行

- コピー途中失敗ではmedia_readyに進まず、正式完成・本棚追加もしない。コピー済み素材は残す。
- DB commit後の応答喪失でもコピー済み素材を削除しない。再実行は一致した素材を再利用する。
- checkout／completedに進んだ同一candidateへの再試行は既存publicationとの整合を確認し、同じ作品・URLを返す。完成済み素材を書き換えない。
- publication作成競合のunique違反は既存行を再取得して解決し、その行のpublic_idを返す。並行copyの競合もdestinationの実バイトを検証する。
- DB状態が並行して次段階へ進んだ場合、未確定側が拒否されることはあるが、素材削除はしない。次の再試行で確定済み状態を取得できる。

StorageとDBは単一transactionではない。本修正は自処理による削除・上書きで「完成DBが欠損素材を参照する」事態を防ぐ。外部からのStorage削除や運用上の改変まで保証するものではない。

## 障害注入TEST

`scripts/tests/web-book-copy-faults.remote.mjs` が実Edge handlerをローカルadapter経由で実行し、隔離したリモートTEST DB／Storageへ接続。fault hookはTEST Edgeにも本番にも組み込まない。下表の決済相当fixtureはzero_paid＋実確定RPCであり、Stripe証跡とは区別する。

|ケース|結果|
|---|---|
|3個目のコピーで失敗|未完成を確認。再試行は先の2件を再利用し残り2件だけコピー、正常完成。PASS|
|DB commit後にエラー応答を返す|素材維持、再試行追加コピー0件、完成・URL・本棚各1件。PASS|
|DB commit後に通信例外を投げる|素材維持、再試行追加コピー0件、完成・URL・本棚各1件。PASS|
|同一candidateの並行実行|publication作成・Storage copy競合を発生させ、双方成功。同じURL・作品・本棚各1件、素材4件。PASS|
|完成後の再実行|同じ完成作品とURL、素材不変、重複なし。PASS|
|正しい既存destination|SHA-256＋サイズ一致で再利用。PASS|
|同サイズだが1バイト違うdestination|上書きも削除もせず拒否。未完成、再試行も拒否。PASS|

Storage remove呼出しは全ケース合計0件。機械結果はローカル `output/web-book-e2e/copy-fault-results.json`（2026-09-23T23:57:59Z）に保存。

## 認可と正常系の回帰

- 前回の素材認可SQL異常系15ケース：PASS（リモートTEST、rollback）。
- 不正素材1件を含む複数素材を実配信TEST Edgeで処理：拒否、公開作品0／本棚0、PASS。
- 実配信TEST Edgeで正規音声・写真のコピー、ハッシュ一致・再試行・URL一意性：PASS。
- Stripe TEST Checkoutを実画面で決済し、completed candidate／published Webブック／本棚各1件と実素材を確認：PASS。cs_testのみ、実課金なし。
- 同じ決済済み作品で制作元の文章・音声・写真参照を変更し、完成版の文章・音声・写真ハッシュ・URLが不変：PASS。
- 完成作品の署名URLから音声・写真を取得して元バイトとの一致を確認：PASS。390×844のChromiumで連続再生開始・実再生時間の進行・シーク・一時停止・fixed mini playerを確認：PASS。初回の固定1.7秒待機ではバッファリング中に失敗したため、時間進行を最大20秒待つ検証へ変更して再確認した。製品UIは変更していない。
- 静的Webブックテスト、private Edgeテスト、build、diff check：PASS。buildの既存chunk-size警告は残る。

## 孤児素材と将来のGC

途中失敗後に再試行しない、コピー後にcandidateをキャンセルする、応答喪失後に利用が止まる場合、未参照のコピーが残り得る。今回は意図的に保持する。不一致destinationも自動修復せず、運営が根拠を調べて対応する。

将来のGCは完成処理と別にし、十分な経過時間・publication／完成snapshot／work／candidateから未参照・処理中や再試行中でないことを全て確認する。削除直前の再確認や処理リース等で参照追加との競合も防ぐ。完成作品prefix単位の一括削除は禁止する。GCは今回未実装。

本番互換性監査の未参照音声2件は一切削除・関連付けしていない。別のデータ衛生タスクとする。

## 残る確認事項

iPhone Safari実機、実動画E2Eは未確認。動画の認可分岐を検証したことと、実動画のアップロード・コピー・再生E2Eは別。大きな動画のハッシュ検証時間／Edge制限も実サイズQAで確認する。Premium追加・完成後増刷・QR実入稿は後続タスク。

本番公開には最新drift確認と閉じた反映・smoke、およびユーザーの別途承認が必要。本書のTEST結果を本番反映済みと解釈しない。

検証終了後、TEST DB rolloutとEdge `BOOK_COMPLETION_ENABLED` はともにOFFへ復帰済み。本番環境・本番Stripe・既存顧客データは未変更。
