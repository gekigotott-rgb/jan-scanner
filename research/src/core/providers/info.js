// ProductInfo（provider が返す、1つの JAN についての Amazon 情報）の共通の形。
// 金額は円・税込。分からない項目は null。フェーズBのサーバーもこの形で返す。

export function emptyInfo(jan, source, error = null) {
  return {
    jan,
    found: false,
    asin: null,
    title: null,
    buyBoxPrice: null,     // カート価格（新品）
    newPrice: null,        // 新品の最安値
    usedPrice: null,       // 中古の最安値
    amazonPrice: null,     // Amazon本体の価格（本体が売っていれば数値）
    salesRank: null,       // 売れ筋ランキング
    rankDrops30: null,     // 30日間にランキングが上がった回数（売れた回数の目安。Keepaのみ）
    referralFee: null,     // 販売手数料の金額（SP-APIのみ。feeBasePrice の値段で見積もったもの）
    feeBasePrice: null,    // referralFee を見積もった販売価格
    referralFeeRate: null, // 販売手数料率（0.1 = 10%。Keepaのみ）
    fbaFee: null,          // FBA配送代行手数料
    source,
    error,
  };
}
