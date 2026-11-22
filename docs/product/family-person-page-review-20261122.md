# 人物ページ（人生・思い出・年表）実画面レビュー

- デザイン正本：[`family-power-v1.0-approved-10-screens.png`](design-references/family-power-v1.0-approved-10-screens.png) の2画面目
- スマートフォン比較：[`family-person-approved-vs-actual-20261122.png`](design-references/family-person-approved-vs-actual-20261122.png)
- 操作可能な隔離TEST：`https://tateyoko-book-test-ge1kq1nxu-tateito-yokoito.vercel.app/?app=family_place`
- デザイン比較：`https://tateyoko-book-test-ge1kq1nxu-tateito-yokoito.vercel.app/family-person-comparison.html`
- 単体レビュー：`https://tateyoko-book-test-ge1kq1nxu-tateito-yokoito.vercel.app/family-person-review.html`

## 実装範囲

既存React人物ページのみを専用部品に置き換えた。生成りの背景、深緑のアクセント、丸いプロフィール領域、余白のあるカード、固定タブで正本に近づけた。家族ホームへの戻り、プロフィール編集、年表、保存済みの語り、無料3問の既存回答画面への遷移は既存のデータ処理を使用する。思い出タブは未実装の思い出カードを表示せず、空状態を示す。BOOKとプロフィール写真も架空データを出さない。質問文はオーナー選定前の暫定値。

正本にある写真、完成BOOK、テーマ別の語りは、今回の実データに存在しない。人物の写真を保存する列・非公開Storage権限も現行の無料人物スキーマにはない。写真登録を可能にするには別途、保存先と権限設計が必要。人物と購入済みBOOKを結ぶ表示も今回の対象外で、完成BOOKを実在するものとして表示しない。比較画像の右側は**同じReact部品の人物登録直後の状態**であり、左側の完成状態とのデータ条件は異なる。

## 隔離TESTの実データ確認

既存メール認証でログインした架空TESTユーザーを使用。新たに架空人物1件を登録し、以下を確認した。

| 項目 | 結果 |
| --- | --- |
| 人物登録・人物ページへの遷移 | 成功 |
| 生年・紹介文の保存と再読み込み | 成功 |
| 年表の自動「誕生」と登録した学歴の年代順表示 | 成功 |
| 人生タブから既存回答UIへ遷移・文章保存・再表示 | 成功 |
| 家族ホームへの復帰と「人生の語り1件」の反映 | 成功 |
| DBで人物1件・紐づくBOOK 0件・本文あり無料語り1件 | 成功 |
| 写真登録・音声録音の再検証 | 未実施（既存の回答部品を変更していない） |
| 完成BOOK・人物写真の実表示 | 未実施（該当するデータ接続がない） |

`npm run test:answer-ui` は18件成功。隔離TESTのビルドにはTESTのSupabase参照だけを使用し、公開用バンドル検査で本番参照・管理者バンドル・ソースマップの混入なし。TEST VercelのPreview配信のみで、本番環境・本番DB・購入処理は変更していない。
