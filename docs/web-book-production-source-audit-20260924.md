# Webブック 本番素材互換性監査・公開判定（2026-09-24）

追記：以下はcleanup修正前の監査記録。互換性PASSは維持し、cleanup修正・障害注入・Stripe TEST回帰後の判定は `web-book-copy-integrity-20260924.md` のCONDITIONAL GOを参照。本番未反映、未参照音声2件は未変更。

今回の判定は **NO-GO（公開ゲートON）**。使用中素材の互換性はPASS。ただしcleanupにDB応答喪失／並行実行時の整合性問題があり、公開前に修正が必要。本番DB・Storage・Edge・Front・Stripe・顧客データは変更していない。認可を緩める変更も行っていない。

## 監査方法と範囲

- 本番 `wquxjeqkumossjxehdop` で `BEGIN READ ONLY`、`transaction_read_only=on` を確認。アプリRPCは呼ばず、所有関係・素材path・Storageカタログ・履歴参照のみSELECT。
- 最終データ取得: 2026-09-24 07:09 JST。ローカル評価: 07:12 JST。スキーマ取得: 06:53 JST。
- 氏名、メール、本文、PIN、秘密鍵、音声・写真・動画の内容は監査成果物へ取得しない。非秘密設定は既知の値とダイジェストだけ照合。
- 新migration `202609240002_publication_legacy_question_compat.sql` の関数そのものをローカルPGliteに読み込み、本番メタデータで評価。本番には関数を作成しない。
- 評価SQL SHA-256: `081e5e4120c9379759688c273bd28f8ad95eb51b176ff2db2e8c7a4f2fd9a93d`。
- Project 9、Person 9、語り22、media_assets 25、表紙設定2、Storage object 29。動画0、既存公開Webブック0、確定snapshot0。BOOK manifestは1件で未確定。
- 現在family binding／production consent／family uploadは0件。family rollout OFF、allowlist 0、本人接続OFFを読み取り確認。この監査を家族管理素材の本番実例テストとは扱わない。
- Storageの存在とサイズはカタログ照合。実ファイルをダウンロード・再生する検査ではない。

## 使用中素材の結果

|種類|件数|path形式|新認可|備考|
|---|---:|---|---|---|
|元の音声|22|`Account/Project/Answer/part-01.mp4`|22/22 true|拡張子mp4だがasset_typeはaudio|
|語り足し音声|3|`Account/Project/Answer/part-02.mp4`|3/3 true|同じ語り・Project・Personへの関連を照合|
|本文写真|0|本番実例なし|対象なし|表紙とは区別|
|動画本体|0|本番実例なし|対象なし|実動画E2E未確認|
|動画付属音声・poster|0|本番実例なし|対象なし|同上|
|標準表紙|2|`book-covers/Project/cover-<timestamp>.jpeg`|2/2 true|Storage photos内|
|Premium表紙|0|本番実例なし|対象なし|Premium追加は今回のgate対象外|

使用中27素材は4つのactive Projectに属する。うち3 Projectに `zero_paid` 注文あり、1 Projectは注文なし。利用中の27素材はすべて許可され、完成工程へ移すための互換補正は不要。

- 非標準path: 0件。
- 旧 `Account/Answer/...` path: 0件。
- 旧 `user_question_id=NULL` の質問関連: 0件。
- 素材のProject／Person／family不一致、語り関連不足、Storage欠損: 0件。
- Project所有Account不存在、Person不存在、ProjectとPersonのfamily不一致、語りAccountとProject所有Accountの不一致: 各0件。
- 別語り／別Projectへ同じ素材pathを流用するなど、新認可が拒否する参照: 0件。
- 正規素材なのに新認可がfalseになるケース: 検出0件。

## 未参照のStorage音声2件

いずれも標準の `Account/Project/Answer/part-01.mp4` 形式で、Projectは存在し、pathのAccountはProject所有者と一致する。一方、path中のAnswerは現在存在せず、media_assetsにも対応行がない。

`retired_media`、`voice_revisions`、`book_milestone_uploads`、`book_milestone_revisions`にも参照なし。確定snapshot・公開Webブックにも参照なし。したがって新完成処理のコピー対象ではなく、現在の使用中27素材にも含めない。

|項目|結果|
|---|---|
|種類／件数|未参照音声2 object。非標準形式ではなく関連データ欠落|
|原因|現存メタデータだけでは断定できない。アップロード後の保存中断・語りの削除等が候補であり、推定|
|現在の影響|1件は語り0・注文0のProject。もう1件は語り9・使用中音声10・zero_paid注文のあるProjectだが、その既存語りからは参照されない。現在選択できる完成素材の欠損ではない|
|安全な対応|現状維持でリリース可能。削除・自動関連付けは行わない。復元を希望する場合のみ、対象語り・本人意思・保存履歴を個別に確認して正しい関連を復元する|
|認可|pathの形だけで許可してはならない。Account/Projectが一致していても、正の語り・素材行なしでは許可しない|

個別IDとpathはGit管理外・0600のローカル監査証跡にのみ保存し、この文書では顧客を特定しない。

## コピー失敗時の現在の挙動（コードレビュー。障害注入未実施）

### 単独の初回処理で、3個目のStorageコピーが失敗

全素材の認可後、コピーを順番に行い、全コピーが終わって初めてDBの `write_book_completion_publication` を呼ぶ。したがって3個目で失敗すれば、初回候補の `media_ready_at` はNULLのまま。draft publicationが残る場合はあるが、checkoutへ進む条件を満たさず、completed／published／本棚追加には進まない。

catchでこの試行が新規作成したコピーを削除する。削除失敗ならログと未参照コピーが残る。再実行は同じ候補IDのpathを使い、存在する正サイズのコピーを再利用し、不足分を作成する。候補が有効で元素材が存在する限り、通常の一時的なコピー障害が恒久的な再実行不能状態を作る設計ではない。実障害注入による確認はしていない。

### 公開ブロッカー：DB結果が不明な場合にも削除する

`publish-voice-edition/index.ts:396` のDB書込みは、DB内ではcommitできても応答だけ喪失する場合がある。現行catch（425行以降）はこの場合もコピーを削除する。しかしDBの候補には `media_ready_at` と素材参照が残る。

`bind_book_completion_order` は `media_ready_at` を条件にcheckoutを許可し、`complete_book_order` はStorage実体を再検証せず、決済済み注文をpublished／completedへ進める。したがって別リクエストや並行処理が続けば、**素材のない完成作品を作れる経路がコード上に残っている**。

また、並行実行は同じ候補IDのコピー先を共有する。Aが作ったコピーをBが再利用・DB確定した後に、Aの失敗cleanupがそのコピーを削除する可能性がある。作成元リクエストを記録した配列だけでは、そのファイルが他の成功処理から参照されていない保証にならない。

これはコード上の不整合経路の指摘であり、実環境で発生した事故または障害注入PASSではない。前回の検証記録にある「cleanup失敗・応答不明は孤立コピーが残るだけ」という説明は、**応答不明について訂正する**。

推奨する最小修正は、エラー直後の自動削除をやめ、同一候補のコピーを保持して再実行に利用すること。孤立コピーの回収は、DB参照・実行中処理・候補状態を照合できる後続処理へ分離する。併せて同一候補の並行実行と、既存コピー再利用時の整合性を確認する。今回の依頼は挙動説明までのため、この変更はまだ実装していない。

修正後に必要な最小検証は「コピー3件目失敗」「DB commit後の応答喪失」「同一候補の並行再実行」。いずれも素材欠損の完成が起きず、再実行で一作品へ収束すること。iPhone実機QAとは別の公開条件として扱う。

## 本棚文言

`src/VoiceLibraryPage.jsx` の「ご家族への共有や増刷は、各作品の管理画面から行えます。」を、実装されている操作に合わせて「作品ごとの『閲覧方法』から、リンク共有や暗証番号を設定できます。」へローカル修正。増刷を現在利用可能と案内しない。レイアウトと閲覧UIは変更なし。build PASS（既存chunk警告あり）。本番未反映。

## 判定材料

|判定|条件／現状|
|---|---|
|GO|cleanupの不整合を解消し上記最小検証PASS、最新本番driftなし、閉鎖反映とsmoke PASS、公開承認あり|
|CONDITIONAL GO|cleanup解消後、Safari実機・実動画E2Eを未確認として明示し、初期限定運用と公開後QAで進める判断。未参照音声2件の存在だけでは止めない|
|NO-GO（現在）|DB応答喪失／並行実行時に、成功した完成準備が参照するコピーをcleanupが削除し得る。素材認可の問題とは別の完成整合性ブロッカー|

iPhone Safari実機、実動画E2E、Storage cleanup障害注入はいずれも未確認。Premium追加、完成後増刷、QR実入稿は今回の初回完成ライフサイクルのブロッカーとはしない。QR実入稿接続は未実装の残課題。

本番rolloutとrollbackの手順は `web-book-production-rollout-20260924.md` を参照。

## 再現用スクリプト・証跡

- `web-book-production-source-audit.mjs --read-only`: 本番素材メタデータと所有関係・履歴参照のSELECT。
- `web-book-source-audit-local.mjs`: 新認可関数の実SQLをローカル評価。
- `web-book.rehearsal.mjs --production-only --with-source-guard`: 本番catalogをローカル復元し、未適用10 migrationを適用。PASS。10本結合SHA-256 `06f92150b7adb0a137d147f87adb9a235e1c6f9d93666cb34c6fba2eed5a166c`。
- `web-book-release-readiness.mjs --read-only`: 対象Edge版・非秘密公開設定・本番HTMLを読み取り。
- 証跡: ignored `output/web-book-source-audit/`。本番データの書込み・素材削除・デプロイ・Stripe呼出しはゼロ。
