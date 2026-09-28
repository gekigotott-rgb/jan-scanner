// フェーズ2用：価格取得の差し替え口。
// 将来は Amazon SP-API や Keepa をここに追加する（APIキーはスマホに置かず、別サーバー経由にすること）。
//
// PriceProvider の約束：
//   getPrice(jan) => Promise<{ title: string|null, lowestPrice: number|null, source: string }>
const PriceProviders = {
  none: {
    name: 'none',
    async getPrice() { return { title: null, lowestPrice: null, source: 'none' }; },
  },
  // amazon: { ... }  // フェーズ2で追加
  // keepa:  { ... }  // 将来
};
let activePriceProvider = PriceProviders.none;
