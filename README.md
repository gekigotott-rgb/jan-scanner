# JANスキャナー

店舗せどり用のバーコード(JAN)連続スキャナー。iPhoneのSafariで開き、「ホーム画面に追加」して使うウェブアプリ(PWA)。
データは端末内に保存されます。設定で Amazon の価格表示を使うときだけ、読んだ JAN と新品/中古の別を自分の価格サーバー（`worker/`）に送ります。店頭価格やメモは送りません。

- 価格のサーバー：worker/README.md（はじめの設定の手順）
- PCで利益の一覧を作る：research/README.md

- 読み取り: zxing-wasm 3.1.4 (MIT) / zxing-cpp (Apache-2.0)
- 詳細: SPEC.md
- 利益リサーチ（書き出したJSONからAmazonの価格と利益を調べるPC用スクリプト）: research/README.md
