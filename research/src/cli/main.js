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
import { parseScanExport } from './input.js';
import { buildResultCsv } from './output.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const HELP = `使い方: node src/cli/main.js <書き出したJSON> [ほかのJSON...] [オプション]

オプション:
  --provider keepa|spapi|mock  調べる先（最初は config.json の provider。なければ keepa）
  --out <ファイル名>           結果CSVの保存先（最初は「<入力ファイル名>_利益.csv」）
  --config <ファイル名>        設定ファイル（最初は research/config.json）
  -h, --help                   この説明を表示`;

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
  const providerName = values.provider ?? config.provider ?? 'keepa';
  const provider = createProvider(providerName, process.env, providerName === 'spapi' ? { isAmazonFulfilled: settings.useFba } : {});

  const records = [];
  for (const file of positionals) records.push(...parseScanExport(await readFile(file, 'utf8'), file));
  const kinds = new Set(records.map((r) => r.jan)).size;
  console.log(`${records.length}件（${kinds}種類）を ${provider.name} で調べます…`);

  const rows = await research(records, provider, settings);
  const out = values.out ?? positionals[0].replace(/\.json$/i, '') + '_利益.csv';
  await writeFile(out, buildResultCsv(rows));

  const count = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(`◎ ${count('◎')}件 / △ ${count('△')}件 / × ${count('×')}件 / ? ${count('?')}件`);
  const errors = [...new Set(rows.map((r) => r.info.error).filter(Boolean))];
  for (const e of errors.slice(0, 5)) console.log(`  ※ ${e}`);
  if (provider.tokensLeft != null) console.log(`Keepa の残りトークン: ${provider.tokensLeft}`);
  if (provider.name === 'mock') console.log('※ お試しデータ（mock）です。実際の価格ではありません。');
  console.log(`保存しました: ${out}`);
}

main().catch((e) => { console.error(`エラー: ${e.message}`); process.exitCode = 1; });
