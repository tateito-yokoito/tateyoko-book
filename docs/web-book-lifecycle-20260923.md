# Webブック・ライフサイクル実装台帳

## 今回の確定仕様（従来案を上書き）

- 制作中は顧客に独立Webブックを表示しない。管理者だけ、現在の素材から共通rendererでLive Preview。閲覧では公開・注文・本棚追加・確定を行わない。
- 仕上げで紙へのQR掲載あり／なし、PINなし（初期値）／4桁PINを選ぶ。QRなしでもWeb作品は作られる。
- 印刷前に恒久URLを予約し、注文完了までは匿名閲覧不可。
- BOOK注文完了で紙＋Webの作品セットを完成。本棚追加。配送完了は条件にしない。通常の利用開始時購入とは別のイベント。
- 完成後は内容・表紙・素材・順序を固定。新版／更新／未反映表示は廃止。閲覧の公開停止・再公開・PINのみ変更可能。URLは不変。
- Premiumは同じ作品／URL。標準QRは扉次＋裏表紙、Premiumは扉次のみ。QRなしなら印刷しない。
- 元素材の変更・削除から完成作品を保護。既存作品・PIN・URL・注文はバックフィルしない。
- Live Previewは作品が本棚に入ったら終了。完成作品は顧客体験→本棚から確認する。公開停止でも制作中に戻さない。
- 管理画面の「本に仕上げる」は削除。「語りを見る」はアカウントを起点とした「顧客体験を見る」へ。自身の物語なしでも支援先へ移動可能。
- 「顧客体験を見る」は今回閲覧専用（2026-09-23確認済み）。actor=管理者、target=顧客Account、capability=readを分離し、将来の代理操作へ拡張できるようにする。実ユーザーのログイン情報・セッションを利用しない。管理者権限で顧客が見られない内容まで出さない。
- 決済中は注文候補内容を保持。変更時は決済キャンセルが必要。決済成功で正式完成、キャンセル／期限切れは制作へ戻す（同日確認済み）。Stripe側の決済確定とキャンセル競合もサーバーで判定。
- 今回は実装→TEST→報告まで。本番変更は最終レビュー後の明示指示まで行わない。

## 実装済み（コード。001〜008はリモートTESTにも反映済み）

- 制作中の顧客向けWeb確認導線をBookBuilderから撤去。
- `202609230003_web_book_admin_live.sql`: 管理者だけ最新内容を取得。固定snapshot・publicationコピーへ置換しない。完成／非公開作品のLive Preview拒否。旧001を後続migrationで置換。
- `web-book-preview` Edgeでもadmin結果必須。認可されていない素材pathの指定不可。
- `WebBookPage`: 管理者Live表示・再読込。「未反映／更新」案内を削除。承認済みrenderer・プレイヤーは不変。
- `202609230002_web_book_pin.sql`: 新規／変更PINは4桁。旧hashは変更せず、旧PIN照合は維持。設定変更で既存閲覧セッションを失効。Edge・本棚設定UIも4桁へ。
- 管理画面で完成／公開停止後のLive Previewボタンを非表示（現在はpublication状態で判定。新注文ライフサイクル接続時に原子的な完成状態と一致させる）。
- `202609230004_book_completion_candidates.sql`: 注文候補と完成作品を分離。候補snapshot・QR・PIN hash・注文ID・素材コピー完了を保持。準備中／決済中の素材編集を拒否。決済済み注文からのみmanifest確定・Web公開・完成を原子的に行う。再実行は同一作品・同一URL。既存作品のバックフィルなし。
- 新注文の準備はDB rollout／フロント／サーバーの専用flagで制御（初期OFF）。決済完了処理は `stripe-webhook` / `sync-checkout-session` / 0円注文から呼び出す。初回サービス購入に候補がなければno-op。
- `cancel-book-completion`: 注文本人・制作権限・family gateを確認し、Stripeの状態を確認してから編集ロックを解除。戻るURLだけを根拠に解除しない。Stripe未送信の場合も注文行ロック下で確認する。
- Stripe送信前に同一リクエストパラメータを注文metadataへ保持。同じ注文のリトライに同じidempotency keyを使用し、レスポンス喪失時も別決済を作らない。新注文では例外を理由に支払済み注文を取消扱いにしない。
- 未決済候補の `disable → resume` による先行公開をEdge・DB triggerの双方で拒否。
- BookBuilder: QR掲載、初期PINなし／4桁設定、準備中の再開／取消、完成後の本棚導線。再開・完成判定はサーバー状態を基準にし、古いCheckout URL・見積0円だけを基準にしない。注文状態取得失敗時は編集／注文を閉じる。
- `202609230005_completed_web_book_library.sql`: 公開停止済みでも本人・有効な制作Supporterは本棚から完成作品を閲覧可能。Payer／Viewer／匿名／単なる管理者権限では非公開作品を開けない。旧本棚RPCの戻り値は変更せず新RPCへ接続。
- 非公開作品の認証付き閲覧は専用rate limitを使用。匿名公開用の停止判定・circuit breakerは緩和しない。公開停止でPIN・URL・完成内容を変更しない。本棚から公開停止／再開／PIN変更が可能。
- `202609230006_book_print_handoff.sql`: 決済済み・完成済み注文に限り、入稿側が注文／作品ID、予約済みURLの相対パス、QR掲載有無、標準・Premium別の掲載位置を取得できるservice-role専用契約。QRなしは両版とも掲載位置空。表表紙は常に含まない。PIN変更でもpublic IDは変わらない。PDF／印刷会社APIは作らない。
- `202609230007_completed_work_sets.sql`: 本棚RPCに紙ブック注文済みと作品セットIDを加え、既存Webブックを保持しつつ、紙＋Webを一枚の作品カードに表示。印刷済み・配送済みとは表示しない。
- `202609230008_admin_customer_experience.sql`: 管理者actor／対象Account／read capabilityを分離した閲覧RPCと監査。既存の顧客向けホーム・支援先・語り・本棚・Webブックの表示部品へ接続。対象Accountに制作閲覧権限がない語り・非公開作品は拒否し、実セッションを切り替えない。

## 未完了・次の確認

1. 「顧客体験を見る」の支援専用Account・Viewer・失効SupporterのTEST実画面回帰。新規隔離TEST顧客本人のホーム→本棚→完成Webブックは実画面で確認済み。役割別のSQL境界も検証済みだが、支援先への画面遷移は別途確認が必要。代理操作は未実装（将来拡張用にactor/target/capabilityを分離済み）。
2. Premium追加・増刷の完成**後**の再注文導線。今回、初回完成注文の追加スタンダード1冊5,000円はStripe TESTで通過。ただし完成後に再入場して増刷する回帰は未了。同一URLを保ち、新たな完成候補を作らないことを要確認。
3. QRの実入稿接続は**未実装の残課題**。印刷会社向け最終データの生成・連携方式が未確定のため、今回PDFや印刷会社APIは作らない。service-roleのhandoff契約から将来の生成処理へ接続する。
4. Webhook再送／通信断、実Storage音声・写真・動画、スマホSafari、顧客／Supporter／Viewer全回帰、最新HPとの統合。今回のStripe TEST決済成功・拒否・キャンセルだけで全体のリリース完了とはしない。本番変更なし。

## テスト

`web-book-pin.test.mjs`: 4桁・先頭0・解除・server role・hash保存・旧hash不変。

`web-book.sql.test.mjs`: 新Live管理者専用・最新編集取得・完成／停止後拒否・既存確定内容不変。

これらはローカルPGliteであり、リモートTESTの注文E2E完了を意味しない。

### 2026-09-23 継続実装での検証

- `book-completion.sql.test.mjs`: ロール・PIN・冪等性・編集ロック／別Projectへの移動拒否・注文前取消・Stripe送信済みの取消拒否・未決済公開拒否・素材準備前拒否・確定途中失敗のrollback・0円確定・PIN反映・URL維持・元データ変更と完成作品の分離。
- `completion-checkout.test.mjs`: 元パラメータ／同じidempotency keyでの再試行、既知sessionはGET、注文／Account／TEST-live不一致拒否（Stripe通信はmock）。
- `book-completion.browser.test.cjs`: 390pxの実BookBuilderで再開・未確定の完成誤表示拒否・取消→新候補・古い決済URL不使用・PIN初期値／先頭0・完成後再読込・取得エラー時fail closed・サーバー確定後のみ完成表示。外部通信を遮断したfixture。
- `web-book-library.sql.test.mjs`: 本人／Supporterの非公開本棚、停止／権限失効、legacy supporterへのフォールバック拒否、匿名／他Account／draft拒否、専用rate limit。役割helperはfixture。
- `web-book-private.edge.test.mjs`: 実 `public-voice` handlerを模擬Supabaseで検証。停止作品は匿名／PIN／旧token／Viewerを拒否、許可された制作主体のみ閲覧、専用throttle、従来公開経路維持。
- `web-book.test.mjs`、既存PIN SQL、Live Preview SQLはPASS。通常build PASS（既存の大きなchunk警告あり）。Edge 6本のesbuild bundle PASS。Denoの完全な型チェックや専用lint完了とは表現しない。
- 最新catalog取得：TEST `2026-09-23T10:48:19.352Z` / 本番 `2026-09-23T10:48:26.552Z`、READ ONLY、秘密値未取得。`output/web-book-lifecycle-preflight/` に保存。
- 001〜005を両catalogからPGliteへ復元して適用PASS。最終SQL SHA-256 `ca84975e5e90929498251e084d06c4311f3d8cb37b2bd70f4ca9b86965cdc170`。
- リモートTEST `2026-09-23T10:57:10.898Z` に同じ5本を単一transactionで適用検査→ROLLBACK。フラグOFF、候補0、authenticated確定不可、匿名非公開閲覧不可を検査。別READ ONLY transactionで新table／RPCが残っていないことを確認。
- 001〜008を最新TEST／本番catalogからPGlite再リハーサル。SQL SHA-256 `db64a7dd8ed2109c5ab7ab3ac1fc97185024327e1078f653488bf4fe16f80f89`。リモートTESTで単一transaction適用→ROLLBACKの検証後、同じ8本をTESTに永続適用。本番DBはREAD ONLY照合のみ。
- TEST Edgeは `public-voice`、`create-checkout-session`、`publish-voice-edition`、`sync-checkout-session`、`stripe-webhook`、`cancel-book-completion`、`web-book-preview` のみ更新。本番Edge/Front/DBは変更なし。
- 新規隔離TEST Account `6809d5cd-22da-4e40-a82a-75016849a7fa` で初回の有料完成注文（増刷1冊・5,000円）をStripe `cs_test_`／`stripe_mode=test` で実決済。`checkout_pending → paid`、`draft → published`、候補`completed`、Book work確定、紙＋Web本棚1カード、完成URLの匿名閲覧を実画面とREAD ONLY DBで確認。実課金なし。
- 同Accountで先行の未決済注文を取消し、注文`expired`／候補`cancelled`／編集復帰を確認。別の隔離TEST Account `f6a3009c-d0ee-4872-8823-a931545b2a5a` でStripe拒否カードを試し、`checkout_pending`・Web `draft`・work未確定を確認後、画面から取消して`expired`／`cancelled`へ復帰。本番・既存顧客データは変更なし。
- E2E後、TESTのDB rolloutとEdge `BOOK_COMPLETION_ENABLED`は両方OFFに戻した。TESTで完成した検証作品は残す。TESTでは新規Account用のデフォルト質問セットが未指定だったため、共通設定を変えず、この2つの隔離AccountにだけProjectと架空の語りを準備した。
- 新規TEST閲覧専用管理者→別の新規TEST顧客で `get_admin_customer_experience`／語り閲覧RPCの対象Account境界を検証。TEST管理画面のアカウント詳細→「顧客体験を見る」→本人ホーム→本棚→完成Webブックを実画面で通した。さらに、自分の物語0件・支援先1件の隔離TEST Accountでも、支援先ホーム→語り→本棚→Webブックを実画面で確認し、録音・編集・注文の操作は表示されなかった。管理者セッションは対象Accountへ切り替えない。検証用管理者権限は終了後に削除済み。
- 回帰: `book-print-handoff`、`completion-checkout`、`web-book-private.edge`、`admin-customer-experience.sql`、`book-completion.sql`、`web-book-library.sql`、`web-book-pin` がPASS。`npm run build` PASS（既存の大きなchunk警告）。`npm run lint` はpackage scriptがなく未実施。
