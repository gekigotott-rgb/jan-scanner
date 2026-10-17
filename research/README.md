# 利益リサーチ（フェーズA）

スキャナーアプリが書き出した **JSON** を読み、Amazon.co.jp の価格・手数料・ランキングを調べて、利益の一覧を **CSV** で作るPC用のスクリプト。

- 対応する入力：Expo版アプリの「JSONで書き出す」／このリポジトリのPWA版の「JSON」
- 調べる先（provider）：**Keepa** / **SP-API** / **mock**（お試し用の架空データ）
- 必要なもの：Node.js 20.12 以上。追加のインストールは不要

## 使い方

```sh
cd research
node src/cli/main.js 書き出したファイル.json
```

`書き出したファイル_利益.csv` ができる。Excel でそのまま開ける（文字化けしない・JANが崩れない）。並び順は、判定の良い順（◎ → △ → ? → ×）・利益の大きい順。

複数のファイルをまとめて調べることもできる：`node src/cli/main.js 1日目.json 2日目.json --out まとめ.csv`

### まずはキーなしで試す

```sh
node src/cli/main.js sample/sample-expo.json --provider mock
```

mock の数字は架空のもの。流れと CSV の見た目を確かめる用。

### キーを設定する

1. `.env.example` を `.env` という名前でコピーし、使うほうのキーを書く
2. `config.example.json` を `config.json` という名前でコピーし、`provider` と判定の基準を自分用に直す

`.env` と `config.json` は Git に入らない。

## 判定と計算

```
利益 = 販売価格 − 販売手数料 − FBA手数料 − 送料(1個あたり) − その他経費 − 仕入れ値
ROI  = 利益 ÷ 仕入れ値
```

| 判定 | 意味 |
|---|---|
| ◎ | 利益が `minProfit` 円以上 **かつ** ROI が `minRoi` 以上 |
| △ | 利益は出るが基準未満 |
| × | 赤字 |
| ? | 判定できない（店頭価格が未入力・Amazonに商品がない・出品がない・エラー） |

- 販売価格は、新品ならカート価格（なければ新品最安）、中古（PWA版で「中古」にした記録）なら中古最安
- 金額はすべて税込。消費税の還付などは考えていない
- 「30日の販売数の目安」は、30日間にランキングが上がった回数（Keepa のみ）。1回 ≒ 1個売れた目安
- 「Amazon本体」が「あり」の商品は、Amazon と価格競争になるので注意

### 設定（config.json の settings）

| 項目 | 最初の値 | 意味 |
|---|---|---|
| `useFba` | `true` | FBA で売るなら true。false にすると FBA手数料を引かない |
| `shippingPerItem` | `0` | 1個あたりの、Amazon倉庫への送料 |
| `otherCostPerItem` | `0` | 1個あたりのその他経費（梱包材など） |
| `minProfit` | `300` | ◎ にする利益（円） |
| `minRoi` | `0.15` | ◎ にする ROI（0.15 = 15%） |
| `minReferralFee` | `30` | 販売手数料の最低額（Keepa のときに使う） |

## Keepa と SP-API の違い

| | Keepa | SP-API |
|---|---|---|
| 契約 | Keepa の有料APIプラン | Amazon の大口出品＋開発者登録 |
| 売れ行き（30日の販売数の目安） | ◎ 分かる | ✕ 今のランキングだけ |
| 手数料 | 率から計算（目安） | Amazon が見積もった金額（正確） |
| 速さ | 100件まとめて1回 | 1件ずつ。100件で3〜4分 |

## 注意

- **実際の Keepa・SP-API にはまだつないで試していない。** 公開されている仕様どおりに作り、応答の読み取りはテストで確かめてある。最初に本物のキーで数件だけ試し、Amazon のページの価格と見比べること
- Keepa はトークン（利用量）を消費する。実行後に残りトークンを表示する
- 価格は調べた時点のもの。仕入れの最終判断は Amazon のページでも確認すること

## フェーズBへの拡張の余地

フェーズBでは、店でJANを読んだ瞬間にスマホへ価格を出す。そのための作りにしてある。

```
research/src/
  core/              ← フェーズBのサーバー（Cloudflare Workers）にそのまま持っていく部分
    jan.js           JANの検証
    profit.js        利益の計算と判定
    research.js      provider の選択と、まとめて調べる処理
    providers/       Keepa / SP-API / mock（どれも同じ形 ProductInfo を返す。info.js）
  cli/               ← フェーズA専用（ファイルの読み書き）
```

- `core/` は Node 専用の機能を使っていない（`fetch` と `setTimeout` だけ）。Workers でも動く
- キーは引数で受け取る。PC では `.env`、Workers では Workers の秘密の設定（secret）から渡す
- Workers 側は、だいたい次の形になる（未作成）：

```js
import { createProvider, research } from './core/research.js';
export default {
  async fetch(request, env) {
    const { searchParams } = new URL(request.url);
    const provider = createProvider(env.PROVIDER || 'keepa', env);
    const [row] = await research([{ jan: searchParams.get('jan'), purchasePrice: Number(searchParams.get('price')) || null }], provider);
    return Response.json(row);
  },
};
```

- アプリ側は、返ってきた価格を「Amazon（kind: 'online'）」の店の記録として保存すれば、比較タブで店頭価格と並べられる
- 新しい調べ先（楽天・Yahoo!ショッピングなど）を足すときは、`providers/` に ProductInfo を返すファイルを1つ足し、`research.js` の `createProvider` に1行足す

## テスト

```sh
npm test
```
