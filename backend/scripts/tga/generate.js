#!/usr/bin/env node
/**
 * 目标生成命令行（由 targetGenService 以子进程方式调用，也可手动运行）。
 *
 *   node scripts/tga/generate.js --algorithm density-expand --seeds seeds.txt --out targets.txt \
 *        [--budget 10000] [--aliased aliased_prefixes.txt] [--summary summary.json] \
 *        [--rng-seed 123] [--option maxWildcards=3 ...]
 *
 * seeds / aliased 每行一项（取第一个逗号前的字段，# 开头的行与空行跳过）。
 * 退出码：0 成功；1 参数或运行错误（原因写到 stderr）。
 * 这是 CLI 工具，直接输出到标准错误。
 */

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
const { generate, makeRng, makeAliasFilter, toNibbles, fromNibbles, MAX_SEEDS, DEFAULT_BUDGET } = require('../../services/tgaAlgorithms');

const parseArgs = (argv) => {
  const args = { options: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--option') {
      const eq = typeof value === 'string' ? value.indexOf('=') : -1;
      if (eq < 1) throw new Error('--option 需要 key=value');
      args.options[value.slice(0, eq)] = value.slice(eq + 1);
      i += 1;
      continue;
    }
    const names = { '--algorithm': 'algorithm', '--seeds': 'seeds', '--out': 'out', '--budget': 'budget', '--aliased': 'aliased', '--summary': 'summary', '--rng-seed': 'rngSeed' };
    if (!names[flag]) throw new Error(`未知参数: ${flag}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少值`);
    args[names[flag]] = value;
    i += 1;
  }
  for (const key of ['algorithm', 'seeds', 'out']) if (!args[key]) throw new Error(`缺少 --${key === 'algorithm' ? 'algorithm' : key}`);
  return args;
};

const readLines = async (file, onLine) => {
  const input = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  try {
    for await (const raw of input) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      onLine(line.split(',')[0].trim());
    }
  } finally {
    input.close();
  }
};

const main = async (argv) => {
  const started = Date.now();
  const args = parseArgs(argv);

  const seeds = new Set();
  let invalid = 0;
  let linesRead = 0;
  await readLines(args.seeds, (text) => {
    linesRead += 1;
    const nibbles = toNibbles(text);
    if (!nibbles) {
      invalid += 1;
      return;
    }
    seeds.add(nibbles);
    if (seeds.size > MAX_SEEDS) throw new Error(`种子地址超过上限 ${MAX_SEEDS}`);
  });

  let isAliased = null;
  let aliasedPrefixes = 0;
  if (args.aliased) {
    const prefixes = [];
    await readLines(args.aliased, (text) => prefixes.push(text));
    aliasedPrefixes = prefixes.length;
    isAliased = makeAliasFilter(prefixes);
  }

  const rngSeed = args.rngSeed !== undefined ? Number(args.rngSeed) : crypto.randomInt(0, 2 ** 32);
  if (!Number.isInteger(rngSeed) || rngSeed < 0 || rngSeed >= 2 ** 32) throw new Error('--rng-seed 必须是 0–4294967295 的整数');
  const budget = args.budget === undefined ? DEFAULT_BUDGET : Number(args.budget);

  const { addresses, stats } = generate({
    algorithm: args.algorithm, seeds: [...seeds], budget, options: args.options, rng: makeRng(rngSeed), isAliased
  });

  const out = fs.createWriteStream(args.out, { flags: 'wx' });
  await new Promise((resolve, reject) => {
    out.on('error', reject);
    out.on('finish', resolve);
    for (const nibbles of addresses) out.write(`${fromNibbles(nibbles)}\n`);
    out.end();
  });

  const summary = {
    algorithm: args.algorithm,
    budget,
    rngSeed,
    seedsRead: linesRead,
    seedsInvalid: invalid,
    aliasedPrefixes,
    durationMs: Date.now() - started,
    ...stats
  };
  if (args.summary) fs.writeFileSync(args.summary, JSON.stringify(summary));
  return summary;
};

if (require.main === module) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
  );
}

module.exports = { main, parseArgs };
