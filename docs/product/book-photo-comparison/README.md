# BOOK写真配置：現行組版の紙面比較

**状態：比較資料。自動配置ルールと操作UIは未決定。** 顧客データは使用していません。画像は `scripts/generate_book_photo_comparison.mjs` が現行の `createBookEdition` → `buildBookPages` → `renderBookPrintHtml` を通してChromeでB5印刷した、紙面全体の画像です。PDFは再生成可能なためGitには含めません。生成条件と物理ページの種類は [conditions.json](./conditions.json) に記録しました。

判型182×257 mm、本文16 pt、現行の余白・文字組みを使用しています。本文は架空の同一文を約100・400・1,000字に調整しました。写真は公開済みの自社サイト素材です。縦型の比較素材は元画像を縦に切り抜いたもので、人物の向きは変えていません。画像URLだけを印刷時にローカルファイルへ差し替え、レイアウト処理は変更していません。

| 条件 | 紙面画像 |
| --- | --- |
| 写真のみ・横1枚 | [問いと写真](./01-photo-only-1-landscape-p03-story-opener.png) |
| 写真のみ・縦1枚 | [問いと写真](./02-photo-only-1-portrait-p03-story-opener.png) |
| 写真のみ・縦横2枚 | [問いと写真](./03-photo-only-2-mixed-p03-story-opener.png) / [追加写真](./03-photo-only-2-mixed-p04-photo.png) |
| 写真のみ・縦横3枚 | [問いと写真](./04-photo-only-3-mixed-p03-story-opener.png) / [写真2](./04-photo-only-3-mixed-p04-photo.png) / [写真3](./04-photo-only-3-mixed-p05-photo.png) |
| 約100字・横1枚 | [問いと写真](./05-short-1-landscape-p03-story-opener.png) / [本文](./05-short-1-landscape-p04-story-body.png) |
| 約100字・縦1枚 | [問いと写真](./06-short-1-portrait-p03-story-opener.png) / [本文](./06-short-1-portrait-p04-story-body.png) |
| 約100字・縦横2枚 | [問いと写真](./07-short-2-mixed-p03-story-opener.png) / [本文](./07-short-2-mixed-p04-story-body.png) / [写真2](./07-short-2-mixed-p05-photo.png) |
| 約100字・縦横3枚 | [問いと写真](./08-short-3-mixed-p03-story-opener.png) / [本文](./08-short-3-mixed-p04-story-body.png) / [写真2](./08-short-3-mixed-p05-photo.png) / [写真3](./08-short-3-mixed-p06-photo.png) |
| 約400字・横1枚 | [問いと写真](./09-medium-1-landscape-p03-story-opener.png) / [本文1](./09-medium-1-landscape-p04-story-body.png) / [本文2](./09-medium-1-landscape-p05-story-body.png) |
| 約400字・縦横2枚 | [問いと写真](./10-medium-2-mixed-p03-story-opener.png) / [本文1](./10-medium-2-mixed-p04-story-body.png) / [本文2](./10-medium-2-mixed-p05-story-body.png) / [写真2](./10-medium-2-mixed-p06-photo.png) |
| 約400字・縦横3枚 | [問いと写真](./11-medium-3-mixed-p03-story-opener.png) / [本文1](./11-medium-3-mixed-p04-story-body.png) / [本文2](./11-medium-3-mixed-p05-story-body.png) / [写真2](./11-medium-3-mixed-p06-photo.png) / [写真3](./11-medium-3-mixed-p07-photo.png) |
| 約1,000字・縦1枚 | [問いと写真](./12-long-1-portrait-p03-story-opener.png) / [本文1](./12-long-1-portrait-p04-story-body.png) / [本文2](./12-long-1-portrait-p05-story-body.png) / [本文3](./12-long-1-portrait-p06-story-body.png) / [本文4](./12-long-1-portrait-p07-story-body.png) |
| 約1,000字・縦横2枚 | [問いと写真](./13-long-2-mixed-p03-story-opener.png) / [本文1](./13-long-2-mixed-p04-story-body.png) / [本文2](./13-long-2-mixed-p05-story-body.png) / [本文3](./13-long-2-mixed-p06-story-body.png) / [本文4](./13-long-2-mixed-p07-story-body.png) / [写真2](./13-long-2-mixed-p08-photo.png) |
| 約1,000字・縦横3枚 | [問いと写真](./14-long-3-mixed-p03-story-opener.png) / [本文1](./14-long-3-mixed-p04-story-body.png) / [本文2](./14-long-3-mixed-p05-story-body.png) / [本文3](./14-long-3-mixed-p06-story-body.png) / [本文4](./14-long-3-mixed-p07-story-body.png) / [写真2](./14-long-3-mixed-p08-photo.png) / [写真3](./14-long-3-mixed-p09-photo.png) |
| 約400字・3枚、手動半ページ | [問いと写真](./15-medium-3-half-manual-p03-story-opener.png) / [本文1](./15-medium-3-half-manual-p04-story-body.png) / [本文2](./15-medium-3-half-manual-p05-story-body.png) / [後続2枚を半ページ配置](./15-medium-3-half-manual-p06-photo-half.png) |

## 現行実装で確認できたこと

- 1枚目は問いのページ、2枚目以降は本文の後に置くのが既定値です。長文は本文ページが先に続き、後続写真と離れます。
- 約100字でも、問いのページに写真を置くと本文は次ページへ独立します。余白が大きく、短文と写真を一緒に見たいかはレビュー判断が必要です。
- 約1,000字では最後の本文ページに短い断片が残る場合があります。ここで勝手にページ割りを変えません。
- 3枚を既定値のまま扱うと後続2枚がそれぞれ1ページになります。既存の手動 `after_half` を選ぶと2枚を同じページに並べられます。
- 写真だけの回答で空の本文ページが生じていたため、`buildBookPages` に空ページを追加しない局所修正を行いました。写真だけの正式保存・DB検証は別の完了条件です。
- 現行の手動配置は `media_assets.meta_json.book_layout`（`placement`、`fit`、`positionX/Y`）を保存し、紙面プレビューとPDFの共通組版へ渡しています。手動設定はデータとして保持されます。
- **3枚は現行の明示的なアップロード上限ではありません。** 手動配置UIでは「問いの下1枚＋本文の後に半ページ2枚」まで選べますが、既定の全ページ配置はそれを超える写真も組版します。回答時の上限は紙面レビュー後に確定する必要があります。

この比較は配置候補の採否を決める資料です。自動配置アルゴリズムはまだ実装していません。
