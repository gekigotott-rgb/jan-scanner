#!/usr/bin/env node
// フェーズA：スキャナーアプリの書き出しJSONを読み、Amazonの価格を調べて利益の一覧CSVを作る。
// 使い方は research/README.md を参照。

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, research } from '../core/research.js';
import { DEFAULT_SETTINGS } from '../core/profit.js';
import { decodeText, parseScanExport } from './input.js';
import { buildResultCsv } from './output.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const HELP = `使い方: node src/cli/main.js <書き出したJSON または 結果CSV> [ほかのファイル...] [オプション]

オプション:
  --provider none|keepa|spapi|mock  調べる先（最初は config.json の provider。なければ none = APIを使わない）
  --out <ファイル名>                結果CSVの保存先（最初は「<入力ファイル名>_利益.csv」）
  --config <ファイル名>             設定ファイル（最初は research/config.json）
  -h, --help                        この説明を表示`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: 'string' },
      out: { type: 'string' },
      config: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) { console.log(HELP); return; }

  // キー類は research/.env に書く（Gitには入らない）
  const envFile = path.join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const configFile = values.config ?? path.join(ROOT, 'config.json');
  const config = existsSync(configFile) ? JSON.parse(await readFile(configFile, 'utf8')) : {};
  const settings = { ...DEFAULT_SETTINGS, ...config.settings };
  const providerName = values.provider ?? config.provider ?? 'none';
  const provider = createProvider(providerName, process.env, providerName === 'spapi' ? { isAmazonFulfilled: settings.useFba } : {});

  const records = [];
  for (const file of positionals) records.push(...parseScanExport(decodeText(await readFile(file)), file));
  const kinds = new Set(records.map((r) => r.jan)).size;
  console.log(`${records.length}件（${kinds}種類）を ${provider.name} で調べます…`);

  const rows = await research(records, provider, settings);
  const out = values.out ?? outputName(positionals[0]);
  try { await writeFile(out, buildResultCsv(rows)); }
  catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') throw new Error(`${out} に保存できません。Excel で開いていたら閉じてから、もう一度実行してください`);
    throw e;
  }

  const count = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(`◎ ${count('◎')}件 / △ ${count('△')}件 / × ${count('×')}件 / ? ${count('?')}件`);
  const errors = [...new Set(rows.map((r) => r.info.error).filter(Boolean))];
  for (const e of errors.slice(0, 5)) console.log(`  ※ ${e}`);
  if (provider.tokensLeft != null) console.log(`Keepa の残りトークン: ${provider.tokensLeft}`);
  if (provider.name === 'none') console.log(`※ APIを使わずに作りました。CSVのリンクで価格を調べ、「Amazon価格(手入力)」に書いて保存したら、\n   node src\\cli\\main.js "${out}" で計算し直せます。`);
  if (provider.name === 'mock') console.log('※ お試しデータ（mock）です。実際の価格ではありません。');
  console.log(`保存しました: ${out}`);
}

/**
 * 保存先の名前を決める。
 * 結果CSVを読ませたときは、そのファイルを計算し直して上書きする（手入力した値は引き継ぐ）。
 * JSONを読ませたときは、すでにある結果CSV（手入力した値が入っているかもしれない）を上書きしない。
 */
function outputName(input) {
  if (/\.csv$/i.test(input)) return input;
  const base = input.replace(/\.json$/i, '') + '_利益';
  let out = `${base}.csv`;
  for (let i = 2; existsSync(out); i++) out = `${base}(${i}).csv`;
  return out;
}

main().catch((e) => { console.error(`エラー: ${e.message}`); process.exitCode = 1; });
