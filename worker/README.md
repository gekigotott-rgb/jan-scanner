# 価格のサーバー（フェーズ2）

スキャナーアプリから JAN を受け取り、Amazon の価格・手数料・ランキングを返す小さなサーバー。
**Cloudflare Workers**（無料枠：1日10万回まで）で動かす。Keepa・SP-API を呼ぶ部分は `research/src/core` をそのまま使っている。

- キー（Keepa・SP-API）はこのサーバーの「秘密の設定（secret）」にだけ入れる。スマホにもリポジトリにも置かない
- スマホからは **合言葉** を付けた問い合わせだけ受け付ける。受け付けるページは `https://gekigotott-rgb.github.io` だけ
- 同じ JAN の結果は1時間保存して使い回す（Keepa のトークンと SP-API の呼び出し回数の節約）
- 使いすぎ防止に、1分あたり60回までにしてある

## はじめの設定（1回だけ）

### 1. Cloudflare の無料アカウントを作る

https://dash.cloudflare.com/sign-up でメールアドレスとパスワードを登録する。カードの登録はいらない。

### 2. GitHub から配置できるようにする

1. Cloudflare の画面右上の人のアイコン →「My Profile」→「API Tokens」→「Create Token」
2. 「Edit Cloudflare Workers」の「Use template」→ そのまま「Continue to summary」→「Create Token」
3. 表示されたトークンをコピーする（一度しか表示されない）
4. Cloudflare の「Workers & Pages」の画面に出ている **Account ID** もコピーする
5. GitHub のこのリポジトリの「Settings」→「Secrets and variables」→「Actions」→「New repository secret」で、次の2つを登録する

| 名前 | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 3 でコピーしたトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 4 でコピーした Account ID |

6. GitHub の「Actions」→「deploy-worker」→「Run workflow」を押す。緑のチェックが付けば配置できている

以後は、`worker/` か `research/src/core/` を変えて main に入れるたびに、自動で配置し直される。

### 3. キーと合言葉を登録する

Cloudflare の「Workers & Pages」→「jan-scanner-api」→「Settings」→「Variables and Secrets」→「Add」で、種類を **Secret** にして登録する。持っているキーの分だけでよい。

| 名前 | 中身 |
|---|---|
| `ACCESS_CODE` | 合言葉。自分で決める長めの文字列（例：英数字20文字）。**必須** |
| `KEEPA_API_KEY` | Keepa の API キー |
| `SP_API_CLIENT_ID` | SP-API の client id |
| `SP_API_CLIENT_SECRET` | SP-API の client secret |
| `SP_API_REFRESH_TOKEN` | SP-API の refresh token |

### 4. スマホのアプリに登録する

1. 同じ画面の「Domains & Routes」に出ている `https://jan-scanner-api.○○.workers.dev` をコピーする
2. アプリの「設定」タブで Keepa か SP-API を選び、サーバーのURLと合言葉を入れる
3. 「つながるか試す」を押す。「つながりました」と出れば完了

## 問い合わせの形

```
GET /lookup?jan=4901234567894&kind=new&provider=keepa
x-access-code: <合言葉>
```

- `kind`：`new`（新品）/ `used`（中古。SP-API は中古の出品価格も調べる）
- `provider`：`keepa` / `spapi` / `mock`（省略すると `wrangler.toml` の `PROVIDER`）
- 返事：`{ info: ProductInfo, kind, tokensLeft }`。ProductInfo の中身は research/README.md の「データの形」

## 困ったとき

| アプリの表示 | 直し方 |
|---|---|
| `つながりません：合言葉が違います` | アプリの合言葉と Cloudflare の `ACCESS_CODE` を見比べる |
| `つながりません：Failed to fetch` など | URL の間違い、または電波がない |
| `つながりました（KEEPA_API_KEY が設定されていません）` | 3 で Keepa のキーを登録する（SP-API も同じ） |
| `問い合わせが多すぎます` | 1分待つ |

## PCで試す

```sh
cd worker
printf 'ACCESS_CODE=test\nALLOWED_ORIGINS=http://localhost:8000\n' > .dev.vars   # Git には入らない
npx wrangler@4 dev
npm test   # ネットにつながずに、合言葉・保存・エラーの扱いを確かめる
```
