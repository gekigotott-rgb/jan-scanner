# 利益リサーチ（フェーズA）

スキャナーアプリが書き出した **JSON** を読み、Amazon.co.jp の価格・手数料・ランキングを調べて、利益の一覧を **CSV** で作るPC用のスクリプト。

- 対応する入力：Expo版アプリの「JSONで書き出す」／このリポジトリのPWA版の「JSON」
- 調べる先（provider）：**Keepa** / **SP-API** / **mock**（お試し用の架空データ）
- 必要なもの：Node.js 20.12 以上。追加のインストールは不要

## 準備

### Node.js を入れる

https://nodejs.org/ja から LTS 版を入れる。入ったかどうかは、ターミナル（Windows は PowerShell）で確かめる：

```sh
node --version   # v20.12.0 以上ならOK
```

### スマホから JSON を取り出す

- **PWA版**：一覧の下の「JSON」ボタンを押し、共有メニューから AirDrop・メール・ファイルアプリなどで PC に送る。ファイル名は `jan-scan_2026-10-17_1241.json` のようになる
  - ふだんは**まだ書き出していない記録だけ**が出る。前に書き出した分も含めたいときは、「書き出し済みも含めて全件」にチェックを入れてから押す
  - **CSV ではなく JSON** を使う。CSV を渡すとエラーになる
- **Expo版**：「JSONで書き出す」で同じように PC に送る

受け取ったファイルは、どこに置いてもよい（`research` フォルダの中でなくてもよい）。

## 使い方

```sh
cd research
node src/cli/main.js 書き出したファイル.json
```

`書き出したファイル_利益.csv` ができる。Excel でそのまま開ける（文字化けしない・JANが崩れない）。並び順は、判定の良い順（◎ → △ → ? → ×）・利益の大きい順。

複数のファイルをまとめて調べることもできる：`node src/cli/main.js 1日目.json 2日目.json --out まとめ.csv`

同じ JAN が何回出てきても、問い合わせは1回だけ（トークンや時間の節約）。CSV には記録ごとに1行ずつ出る。

### オプション

| オプション | 意味 | 指定しないとき |
|---|---|---|
| `--provider keepa\|spapi\|mock` | 調べる先 | `config.json` の `provider`。それもなければ `keepa` |
| `--out <ファイル名>` | 結果 CSV の保存先 | `<1つ目の入力ファイル名>_利益.csv`（入力と同じフォルダ） |
| `--config <ファイル名>` | 設定ファイル | `research/config.json`。なければ最初の値で動く |
| `-h`, `--help` | 使い方を表示 | |

`npm run research -- 書き出したファイル.json` でも同じように動く（`--` のあとにファイル名とオプションを書く）。

### まずはキーなしで試す

```sh
node src/cli/main.js sample/sample-expo.json --provider mock
```

mock の数字は架空のもの。流れと CSV の見た目を確かめる用。

### キーを設定する

1. `.env.example` を `.env` という名前でコピーし、使うほうのキーを書く
2. `config.example.json` を `config.json` という名前でコピーし、`provider` と判定の基準を自分用に直す

`.env` と `config.json` は Git に入らない。

```sh
cp .env.example .env
cp config.example.json config.json
```

（Windows の PowerShell では `copy .env.example .env` のように `copy` を使う）

## 結果CSVの見方

| 列 | 中身 |
|---|---|
| 判定 | ◎ / △ / × / ?（下の「判定と計算」） |
| JAN | 13桁のJAN。Excel で数字が崩れない形で入れてある |
| Amazonの商品名 | Amazon 側の商品名 |
| アプリの商品名・店 | アプリで入れた商品名と店（Expo版のみ。PWA版は空） |
| 日時 | 読み取った日時 |
| 種別 | 新品 / 中古（PWA版で選んだもの。空なら新品として計算） |
| 仕入れ値 | アプリで入れた店頭価格（税込として扱う） |
| 販売価格・販売価格の種類 | 計算に使った Amazon の価格と、それが「カート」「新品最安」「中古最安」のどれか |
| 販売手数料・FBA手数料 | 引いた手数料（円） |
| 利益 | 1個売ったときの手残り（円） |
| 利益率(対販売価格) | 利益 ÷ 販売価格 |
| ROI(対仕入れ値) | 利益 ÷ 仕入れ値 |
| ランキング | 今の売れ筋ランキング（小さいほど売れている） |
| 30日の販売数の目安 | Keepa のみ（下を参照） |
| Amazon本体 | Amazon 自身が売っていれば「あり(価格)」 |
| 新品最安・中古最安 | 参考の最安値 |
| ASIN・Amazonのページ | 商品ページへのリンク。仕入れ前にここで確かめる |
| メモ | アプリで入れたメモ |
| 取得元 | keepa / spapi / mock |
| エラー | 調べられなかった理由 |

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

「?」になる主な理由（エラー列も見る）：

- アプリで店頭価格を入れていない
- JAN の桁数やチェックデジットがおかしい（「JANコードが正しくありません」）
- Amazon に商品ページがない、または出品がなく価格が分からない
- Keepa で FBA手数料が分からない商品（`useFba` を false にすれば FBA手数料なしで計算される）
- **SP-API で「中古」の記録を調べたとき**（下の表を参照）

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
| 中古の判定 | できる（中古最安と手数料率から計算） | できない（新品の価格しか取らないため「?」になる） |

中古の記録が多いときは Keepa を使う。

## 困ったとき

| 表示 | 直し方 |
|---|---|
| `KEEPA_API_KEY が設定されていません` | `.env` に Keepa のキーを書く。キーなしで試すだけなら `--provider mock` |
| `SP_API_CLIENT_ID / … が設定されていません` | `.env` に SP-API の3つの値を書く |
| `… は JSON として読めません` | アプリから **JSON** で書き出し直す（CSV は使えない） |
| `… はスキャナーアプリの書き出し形式ではありません` | 別の JSON を渡している。アプリの書き出しファイルか確かめる |
| `知らない provider です` | `--provider` は keepa / spapi / mock のどれか |
| `Keepa エラー: 401` など | キーが違う、契約が切れている、トークンが足りない。Keepa のサイトで確かめる |
| `SP-API の認証に失敗しました` | client id / secret / refresh token のどれかが違う |
| `SP-API エラー(…)` | その商品だけ調べられなかった。ほかの行は続けて調べてある |
| `process.loadEnvFile is not a function` | Node.js が古い。20.12 以上を入れ直す |

## 注意

- **実際の Keepa・SP-API にはまだつないで試していない。** 公開されている仕様どおりに作り、応答の読み取りはテストで確かめてある。最初に本物のキーで数件だけ試し、Amazon のページの価格と見比べること
- Keepa はトークン（利用量）を消費する。実行後に残りトークンを表示する
- 価格は調べた時点のもの。仕入れの最終判断は Amazon のページでも確認すること

## データの形（ProductInfo）

どの provider も、1つの JAN について次の形で返す（`src/core/providers/info.js`）。金額は円・税込で、分からない項目は `null`。

| 項目 | 中身 | Keepa | SP-API |
|---|---|---|---|
| `jan` | 13桁（または8桁）の JAN | ○ | ○ |
| `found` | Amazon に商品があったか | ○ | ○ |
| `asin` / `title` | ASIN と商品名 | ○ | ○ |
| `buyBoxPrice` | カート価格（新品） | ○ | ○ |
| `newPrice` / `usedPrice` | 新品・中古の最安値 | ○ / ○ | ○ / ✕ |
| `amazonPrice` | Amazon本体の価格 | ○ | ✕ |
| `salesRank` | 売れ筋ランキング | ○ | ○ |
| `rankDrops30` | 30日間にランキングが上がった回数 | ○ | ✕ |
| `referralFee` / `feeBasePrice` | 販売手数料の金額と、それを見積もった価格 | ✕ | ○ |
| `referralFeeRate` | 販売手数料率（0.1 = 10%） | ○ | ✕ |
| `fbaFee` | FBA配送代行手数料 | ○ | ○ |
| `source` / `error` | 取得元と、調べられなかった理由 | ○ | ○ |

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

ネットにはつながずに、JAN の検証・利益の計算と判定・入力 JSON の読み取り・CSV の形・Keepa と SP-API の応答の読み取りを確かめる。
