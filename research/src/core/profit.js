// 利益の計算と仕入れ判定。金額はすべて円・税込。

export const DEFAULT_SETTINGS = {
  useFba: true,          // FBAで売る前提なら true（FBA手数料を引く）
  shippingPerItem: 0,    // 1個あたりのAmazon倉庫への送料
  otherCostPerItem: 0,   // 1個あたりのその他経費（梱包材など）
  minProfit: 300,        // この金額以上の利益で「◎」
  minRoi: 0.15,          // かつ、仕入れ値に対する利益率がこれ以上で「◎」
  minReferralFee: 30,    // 販売手数料の最低額（ほとんどのカテゴリで30円）
};

/**
 * 1件分の利益を計算する。
 * info は provider が返す ProductInfo（README の「データの形」を参照）。
 * kind が 'used' なら中古の最安値で売る前提にする。
 */
export function calcProfit({ purchasePrice, kind }, info, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const out = { sellPrice: null, sellPriceType: null, referralFee: null, fbaFee: null, profit: null, margin: null, roi: null };
  if (!info || !info.found) return out;

  if (kind === 'used') {
    if (info.usedPrice != null) [out.sellPrice, out.sellPriceType] = [info.usedPrice, '中古最安'];
  } else if (info.buyBoxPrice != null) {
    [out.sellPrice, out.sellPriceType] = [info.buyBoxPrice, 'カート'];
  } else if (info.newPrice != null) {
    [out.sellPrice, out.sellPriceType] = [info.newPrice, '新品最安'];
  }
  if (out.sellPrice == null) return out;

  // SP-API は手数料の金額を、Keepa は手数料率を返す。金額があればそちらを使う
  // （SP-API の金額はカート価格で見積もっているため、中古の値段とは合わないことがある）
  if (info.referralFee != null && info.feeBasePrice === out.sellPrice) {
    out.referralFee = info.referralFee;
  } else if (info.referralFeeRate != null) {
    out.referralFee = Math.max(Math.round(out.sellPrice * info.referralFeeRate), s.minReferralFee);
  }
  out.fbaFee = s.useFba ? info.fbaFee : 0;

  if (purchasePrice == null || out.referralFee == null || out.fbaFee == null) return out;
  out.profit = out.sellPrice - out.referralFee - out.fbaFee - s.shippingPerItem - s.otherCostPerItem - purchasePrice;
  out.margin = out.profit / out.sellPrice;
  out.roi = purchasePrice > 0 ? out.profit / purchasePrice : null;
  return out;
}

/** 仕入れ判定。◎ = 基準を満たす / △ = 利益は出るが基準未満 / × = 赤字 / ? = 判定できない */
export function judge(result, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  if (result.profit == null) return '?';
  if (result.profit <= 0) return '×';
  if (result.profit >= s.minProfit && (result.roi == null || result.roi >= s.minRoi)) return '◎';
  return '△';
}

/**
 * 仕入れ上限：この店頭価格以下で買えば「◎」になる金額（円、切り捨て）。
 * 店で読んだ直後（店頭価格がまだ分からないとき）に、買ってよい値段の目安として出す。
 * 販売価格や手数料が分からないときは null。0 以下なら、いくらで買っても ◎ にならない。
 */
export function maxPurchasePrice(kind, info, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const c = calcProfit({ purchasePrice: 0, kind }, info, s);
  if (c.profit == null) return null;
  const net = c.profit; // 仕入れ値 0 円のときの利益 = 販売価格から手数料・経費を引いた残り
  return Math.floor(Math.min(net - s.minProfit, net / (1 + s.minRoi)));
}
