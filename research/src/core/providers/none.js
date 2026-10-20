// API を使わないとき用。何も調べず、CSV には調べるためのリンクだけを付ける。
// Amazon の価格は、CSV の「Amazon価格(手入力)」に手で書き込む。

import { emptyInfo } from './info.js';

export function createNoneProvider() {
  return {
    name: 'none',
    async lookup(jans) {
      return new Map(jans.map((jan) => [jan, emptyInfo(jan, 'none')]));
    },
  };
}
