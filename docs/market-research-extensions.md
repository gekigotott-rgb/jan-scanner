# 電脳せどり向け 既存ツールの調査（無料でできること／有料でできること）

調査日：2026-10-24。Web 検索で見つかった解説記事・ストア掲載情報をもとにまとめた。
**各社の公式サイトは直接確認できていない**（この環境から接続できなかった）ので、料金は「目安」。記事によって時期が違い、値段が食い違うものはその旨を書いた。

---

## 1. まとめ（先に結論）

| ツール | 形 | 無料でできること | 有料でできること | 有料の料金（目安） |
|---|---|---|---|---|
| **Keepa** | Chrome拡張＋サイト | Amazon商品ページに**価格推移グラフ**、値下がり通知（要登録） | ランキング推移・出品者数・新品/中古別の推移などの**詳しいグラフ**、Product Finder（条件で商品を探す）、詳しい通知 | 月€29／年€290 という記事が多い（旧価格 月€19／年€189 の記事も残る）。**API は別料金**で月€49〜 |
| **ERESA（イーリサ）** | Chrome拡張＋アプリ | Amazon（.co.jp/.com）の価格・ランキング・出品者数のグラフ（**直近3か月まで**）、月の販売数の目安、利益計算 | ERESA PRO：グラフ期間の延長、詳細検索、セラーリサーチ、AI分析、検索結果一覧に Keepa グラフと損益分岐点 | App Store 掲載：月3,900円／年38,800円（1週間無料）。2024年の記事では月4,980円 |
| **ショッピングリサーチャー** | Chrome拡張 | Amazon 画面に**他ショップ（楽天・Yahoo!等）へのリンクと価格差**、価格推移 | PRO版：広告非表示、あとで見る（300件）、ASINコピー、**利益率・FBA手数料の自動計算**、サイズ判定 | 月3,980円（旧 LITE 980円は新規受付終了） |
| **モノトレーサー** | サイト＋Chrome拡張 | ランキング/価格グラフ（無料会員登録で全機能） | ― 有料プランの情報なし | 無料 |
| **デルタトレーサー** | サイト | ― （以前は無料、モノレート終了後に有料化） | 価格・出品者数の推移、Keepa 有料相当のグラフ | 月2,200円 |
| **セラースケット** | Webサービス＋Chrome拡張 | ― | Amazon商品ページ上の**利益計算表**（手数料自動、小型軽量・自己発送・為替対応）、売り切り確率、サイズ自動取得、**真贋調査リスクの警告**（出品規制・危険メーカー） | スタンダード月2,480円／プレミアム月4,980円、価格改定は＋500円 |
| **プライスター** | Webサービス＋アプリ | ― （初月30日無料） | 価格の自動改定（6パターン・赤字ストッパー）、出品、納品プラン、売上・利益の自動計算、商品リサーチ | 月5,280円（税込）。**大口出品者のみ** |
| **せどりすとプレミアム** | アプリ＋Chrome拡張 | ― | 選んだ文字列（型番・JAN）をアプリへ送って検索 | 有料（料金は確認できず） |
| **モノサーチ**／**せどり検索アシスト**／**ちゅる楽天版** など小さな拡張 | Chrome拡張 | Amazon ページにランキング・在庫数・手数料、家電量販店サイトに JAN を表示、楽天に Keepa グラフと利益額、など | ― | 基本無料（詳細は確認できず） |
| **Ama-Jack** | iOSアプリ | JAN 読み取り・型番検索で Amazon との価格差、楽天/Yahoo!/ヤフオクへ1タップ | ― | 無料 |

---

## 2. 「無料の範囲」と「お金を払うと増えるもの」の傾向

### 無料でだいたい揃うもの
- **Amazon 商品ページ上のグラフ**（価格推移）… Keepa 無料、ERESA 無料（3か月まで）、モノトレーサー
- **他ショップへの移動・価格差の表示** … ショッピングリサーチャー無料版、Ama-Jack
- **JAN／型番の表示・コピー** … 小さな単機能拡張が多数
- **ざっくりした利益計算** … ERESA 無料、モノサーチ（手数料の自動計算）

### 有料にしている（＝お金を取れている）もの
1. **データの深さ・長さ**：ランキング推移、出品者数推移、長期間の履歴（Keepa・ERESA PRO・デルタ）
2. **一覧で効率化**：検索結果一覧にグラフ・損益分岐点を並べる、条件で商品を探す（ERESA PRO、Keepa Product Finder）
3. **正確な利益計算**：FBA 手数料・サイズ区分・小型軽量の自動判定（セラースケット、ショッピングリサーチャーPRO）
4. **アカウントを守る情報**：出品規制・真贋調査リスクの警告（セラースケット）
5. **出品後の運用**：価格改定・在庫・売上管理（プライスター、セラースケット）
6. **AI 分析**（ERESA PRO）

料金の相場は **月2,000〜5,000円**。Keepa 有料（約€29）を前提に、その上に乗るツールが多い。

---

## 3. 既存ツールの弱いところ（作るならここ）

調べた範囲で、次はまだ手薄そうだった。

- **仕入れ先サイト側での表示**：多くは「Amazon 側」に情報を出す。**楽天・Yahoo!・家電量販店などの商品ページ上で、そのまま Amazon の売値・手数料・利益を出す**ものは、小さな個人拡張（ちゅる楽天版、せどり検索アシストなど）くらいで、対応サイトも限られる。
- **ポイント還元・クーポン込みの実質仕入れ値**：楽天ポイント・PayPay 還元を入れた利益計算をきちんとやるものは見当たらなかった。
- **仕入れ先の一覧ページで一括判定**：検索結果一覧の各商品に「利益○円／ランキング○位」を並べる機能は、Amazon 側（ERESA PRO）にはあるが、仕入れ先側では少ない。
- **店舗せどりとの共有**：このリポジトリの JAN スキャナーと同じ「仕入れ候補リスト」に電脳の候補も入れられれば、他にない組み合わせになる。

---

## 4. このリポジトリで拡張機能を作る場合のメモ

- すでに `worker/`（Cloudflare Workers）が **JAN → Amazon の価格・手数料・ランキング** を返す。拡張機能からも同じサーバーを呼べば、Keepa/SP-API のキーを拡張機能に入れずに済む。
- 拡張機能でやることは主に「仕入れ先ページから JAN と価格を読む」→「worker に問い合わせ」→「ページ上に利益を表示」。
- **データの取り方は規約に注意**。モノレートは Amazon から規約違反を指摘されて 2020年6月に終了したと伝えられている。Amazon のページを勝手に読み取って集めるより、**SP-API（自分の出品者アカウントで使う）か Keepa API** を通すのが安全。
  - SP-API：他の人に配る（公開アプリ）なら Selling Partner Appstore への登録と審査が必要。自分だけで使うなら「プライベートアプリ」。
  - Keepa API：月€49〜（トークン制）。ブラウザの有料プランとは別料金。
- 楽天・Yahoo! のページから読む場合も、各サイトの利用規約と、公式 API（楽天ウェブサービス、Yahoo!ショッピング API）があればそちらを使うのが無難。

---

## 出典（検索で参照したページ）

- Keepa 料金：[amzfinder – Keepa Pricing 2026](https://www.amzfinder.com/blog/keepa-pricing/)、[revenuegeeks – Keepa Review 2026](https://revenuegeeks.com/software/keepa)、[revenuegeeks – Keepa API](https://revenuegeeks.com/software/keepa/api)、[SellerTrove](https://sellertrove.com/keepa-pricing)、[オークファン](https://aucfan.com/times/archives/54193)
- ERESA：[App Store](https://apps.apple.com/jp/app/eresa-%E3%82%A4%E3%83%BC%E3%83%AA%E3%82%B5/id1620145480?l=en-US)、[Chrome ウェブストア](https://chrome.google.com/webstore/detail/eresa%E3%82%A4%E3%83%BC%E3%83%AA%E3%82%B5-amazon%E5%95%86%E5%93%81%E4%BE%A1%E6%A0%BC%E5%A4%89%E5%8B%95%E3%83%A9%E3%83%B3%E3%82%AD/lgdbkbiiahlakkjphejbmjncbncgmbkj/reviews?hl=en)、[オークファン](https://aucfan.com/times/archives/59122)
- ショッピングリサーチャー：[m-stock](https://www.m-stock-series.jp/shopping-researcher/)、[EC STARs Lab](https://ecstarslab.com/blog/post-3364/)、[sedo.li](https://sedo.li/309.html)、[公式LP](https://shopping-researcher.appspot.com/lp/shoppingResearcher)
- モノトレーサー／デルタトレーサー：[ec-seller-labo](https://ec-seller-labo.co.jp/article/monotracer-registration-monthly-fee/)、[hikomhikom](https://hikomhikom.com/mono-tracer/)、[sedori-fugetsu](https://sedori-fugetsu.com/sedori/delta-tracer-sedori/)、[エコリング（モノレート終了）](https://auction.eco-ring.com/blog/information/%E3%80%902025%E5%B9%B4%E6%9C%80%E6%96%B0%E7%89%88%E3%80%91%E3%83%A2%E3%83%8E%E3%83%AC%E3%83%BC%E3%83%88%E7%B5%82%E4%BA%86%E5%BE%8C%E3%81%AE%E4%BB%8A%E3%80%81amazon%E3%81%9B%E3%81%A9%E3%82%8A%E3%81%AB/)
- セラースケット：[公式](https://sellersket.com/listing)、[EC STARs Lab](https://ecstarslab.com/blog/sellersket/)、[hikomhikom](https://hikomhikom.com/sellersket-price/)、[naminori-try（レビュー）](https://naminori-try.com/2020/10/22/sellersket/)
- プライスター：[EC STARs Lab](https://ecstarslab.com/blog/pricetar-monthly-price/)、[semuis](https://semuis.jp/pricetar-guide/)、[sabosedo（2026年更新）](https://www.sabosedo-experience.com/pricetar/1571/)
- せどりすとプレミアム：[App Store](https://apps.apple.com/jp/app/%E3%81%9B%E3%81%A9%E3%82%8A%E3%81%99%E3%81%A8%E3%83%97%E3%83%AC%E3%83%9F%E3%82%A2%E3%83%A0/id878659679?mt=8)、[Chrome ウェブストア](https://chrome.google.com/webstore/detail/%E3%81%9B%E3%81%A9%E3%82%8A%E3%81%99%E3%81%A8%E3%83%97%E3%83%AC%E3%83%9F%E3%82%A2%E3%83%A0chrome%E6%8B%A1%E5%BC%B5%CE%B2/damfeieepngjljncnfjjniegmepbahbk)
- 小さな拡張の一覧：[T-SALT（note）](https://note.com/clean_daisy619/n/n21791e451f41)、[せどり検索アシスト（note）](https://note.com/macroman/n/nf4a35d413e42)、[chanyama](https://chanyama.info/chanyama-tool/)、[せど副](https://sedori-rank.com/efficient-amazon-arbitrage-free-chrome-extensions/)、[oresedo](https://oresedo.com/app-tool/)
- Ama-Jack：[App Store](https://apps.apple.com/jp/app/%E3%81%9B%E3%81%A9%E3%82%8A%E3%82%A2%E3%83%97%E3%83%AA%E3%81%AA%E3%82%89ama-jack-%E4%BB%95%E5%85%A5%E3%82%8C-%E8%BB%A2%E5%A3%B2%E3%82%92%E3%82%82%E3%81%A3%E3%81%A8%E6%89%8B%E8%BB%BD%E3%81%AB/id1542317545)
- SP-API：[SP-API Registration Overview](https://developer-docs.amazon.com/sp-api/lang-ja_JP/docs/sp-api-registration-overview)
