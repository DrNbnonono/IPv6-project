/**
 * Agent 知识库检索（P4-5）。
 *
 *   indexDocuments(dirs)       把目录里的 .md / .txt 文档切块写入 knowledge_chunks（迁移 sql/14-knowledge-chunks.sql）
 *   searchKnowledge(query, k)  MySQL 8 的 ngram 全文检索，返回得分最高的 k 块
 *
 * 不引入向量库：中文按 2 字切分的全文检索对“术语 + 概念”类问题足够用，部署也简单。
 * 代价是语义相近但用词不同的问题（如“邻居发现”和“NDP”）可能检索不到——知识文档里要把常用叫法都写进去。
 *
 * 文档来源（默认）：backend/knowledge/（随仓库提供的 IPv6 知识摘要、平台说明、项目自己的结论）、
 * docs/xmap、docs/zgrab2（如果存在）；KNOWLEDGE_EXTRA_DIRS 可以追加目录（逗号分隔，相对项目根目录或绝对路径）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const storageService = require('./storageService');
const { createModuleLogger } = require('./loggerService');
const logger = createModuleLogger('knowledge');

const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || path.join(__dirname, '../..'));
const DEFAULT_CHUNK_LENGTH = 800;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEPTH = 5;
const MAX_CHUNKS_PER_FILE = 500;
const MAX_QUERY_LENGTH = 200;
const MAX_TOP_K = 10;
const EXTENSIONS = new Set(['.md', '.txt']);
const INSERT_BATCH = 100;

const rows = (result) => (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : []);

/** 默认的文档目录。 */
const defaultDirs = () => {
  const dirs = [
    path.join(PROJECT_ROOT, 'backend', 'knowledge'),
    storageService.DIRS.docsXmap,
    storageService.DIRS.docsZgrab2
  ];
  const extra = String(process.env.KNOWLEDGE_EXTRA_DIRS || '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const dir of extra) dirs.push(path.resolve(PROJECT_ROOT, dir));
  return dirs;
};

// ---------- 切块 ----------

/**
 * 把 Markdown / 纯文本切成块。按标题分节，节内按空行分段，段落累积到 maxLength 为止；
 * 单个超长段落按句末标点再切。每块的标题是“文档标题 > 小节标题”。
 * 返回 [{ title, content }]。代码块（```）不会被空行拆开。
 */
const chunkMarkdown = (text, { maxLength = DEFAULT_CHUNK_LENGTH, docTitle = '' } = {}) => {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let heading = '';
  let title = docTitle;
  let buffer = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence ? /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (m) {
      flush();
      if (m[1].length === 1 && !title) title = m[2];
      heading = m[1].length === 1 ? '' : m[2];
    } else {
      buffer.push(line);
    }
  }
  flush();

  const splitLong = (paragraph) => {
    if (paragraph.length <= maxLength) return [paragraph];
    const parts = [];
    let current = '';
    for (const sentence of paragraph.split(/(?<=[。！？；!?;.\n])/)) {
      if ((current + sentence).length > maxLength && current) {
        parts.push(current);
        current = '';
      }
      let rest = sentence;
      while (rest.length > maxLength) {
        parts.push(rest.slice(0, maxLength));
        rest = rest.slice(maxLength);
      }
      current += rest;
    }
    if (current) parts.push(current);
    return parts;
  };

  const chunks = [];
  for (const section of sections) {
    // 空行分段，但围栏代码块整体保留
    const paragraphs = [];
    let para = [];
    let fenced = false;
    for (const line of section.body.split('\n')) {
      if (/^\s*```/.test(line)) fenced = !fenced;
      if (!fenced && line.trim() === '' && !/^\s*```/.test(line)) {
        if (para.length) paragraphs.push(para.join('\n'));
        para = [];
      } else {
        para.push(line);
      }
    }
    if (para.length) paragraphs.push(para.join('\n'));

    const label = [title, section.heading].filter(Boolean).join(' > ') || '（无标题）';
    let current = '';
    for (const paragraph of paragraphs.flatMap(splitLong)) {
      if (current && (current.length + paragraph.length + 2) > maxLength) {
        chunks.push({ title: label, content: current });
        current = '';
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    if (current) chunks.push({ title: label, content: current });
  }
  return chunks;
};

const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

// ---------- 读取文档 ----------

/** 递归列出目录里的文档文件（跳过符号链接、过大的文件、隐藏目录）。 */
const listDocuments = (dir, depth = 0) => {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return files;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // README.md 是给维护者看的说明（模板、约定），不进知识库
    if (entry.name.startsWith('.') || entry.isSymbolicLink() || entry.name.toLowerCase() === 'readme.md') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) files.push(...listDocuments(full, depth + 1));
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      try {
        if (fs.statSync(full).size <= MAX_FILE_BYTES) files.push(full);
      } catch (error) {
        // 文件在扫描过程中消失，忽略
      }
    }
  }
  return files;
};

/** source 用相对项目根目录的路径（统一斜杠），目录在项目外时用绝对路径。 */
const sourceOf = (file) => {
  const relative = path.relative(PROJECT_ROOT, file);
  return (relative.startsWith('..') || path.isAbsolute(relative) ? file : relative).split(path.sep).join('/').slice(0, 255);
};

const buildFileChunks = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const fallbackTitle = path.basename(file, path.extname(file));
  const chunks = chunkMarkdown(text, { docTitle: '' }).slice(0, MAX_CHUNKS_PER_FILE);
  return chunks.map((chunk, index) => ({
    chunkNo: index,
    title: (chunk.title === '（无标题）' ? fallbackTitle : chunk.title).slice(0, 255),
    content: chunk.content,
    hash: hashOf(`${chunk.title}\n${chunk.content}`)
  }));
};

// ---------- 索引 ----------

/**
 * 索引目录里的文档。内容没变的文档跳过；变了的先删后写；
 * 位于这些目录下、但文件已经不存在的旧来源会被清掉（pruneDirs 以外的来源不动）。
 * 返回 { files, indexed, unchanged, chunks, removed }。
 */
const indexDocuments = async (dirs = defaultDirs()) => {
  const list = Array.isArray(dirs) ? dirs : [dirs];
  const stats = { files: 0, indexed: 0, unchanged: 0, chunks: 0, removed: 0 };
  const seen = new Set();

  for (const dir of list) {
    for (const file of listDocuments(dir)) {
      const source = sourceOf(file);
      if (seen.has(source)) continue;
      seen.add(source);
      stats.files += 1;

      let chunks;
      try {
        chunks = buildFileChunks(file);
      } catch (error) {
        logger.warn(`读取文档失败 ${source}: ${error.message}`);
        continue;
      }

      const existing = rows(await db.query('SELECT chunk_no, content_hash FROM knowledge_chunks WHERE source = ? ORDER BY chunk_no', [source]));
      const same = existing.length === chunks.length && existing.every((row, i) => Number(row.chunk_no) === chunks[i].chunkNo && row.content_hash === chunks[i].hash);
      if (same) {
        stats.unchanged += 1;
        stats.chunks += chunks.length;
        continue;
      }

      await db.query('DELETE FROM knowledge_chunks WHERE source = ?', [source]);
      for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
        const slice = chunks.slice(i, i + INSERT_BATCH);
        const placeholders = slice.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const values = slice.flatMap((chunk) => [source, chunk.chunkNo, chunk.title, chunk.content, chunk.hash]);
        await db.query(`INSERT INTO knowledge_chunks (source, chunk_no, title, content, content_hash) VALUES ${placeholders}`, values);
      }
      stats.indexed += 1;
      stats.chunks += chunks.length;
    }
  }

  // 清理：这些目录下已经不存在的来源
  const prefixes = list.map((dir) => `${sourceOf(path.join(dir, 'x')).replace(/x$/, '')}`);
  const known = rows(await db.query('SELECT DISTINCT source FROM knowledge_chunks'));
  for (const { source } of known) {
    if (!seen.has(source) && prefixes.some((prefix) => source.startsWith(prefix))) {
      await db.query('DELETE FROM knowledge_chunks WHERE source = ?', [source]);
      stats.removed += 1;
    }
  }

  logger.info(`知识库索引完成: ${JSON.stringify(stats)}`);
  return stats;
};

// ---------- 检索 ----------

const isMissingTable = (error) => error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);

/**
 * 全文检索。返回 { available, results: [{ chunkId, source, title, content, score }] }。
 * 知识库表不存在（迁移 14 未执行）时 available 为 false；其他数据库错误照常抛出。
 * ngram 分词按 2 字切，所以少于 2 个字符的查询检索不到东西（返回空结果）。
 */
const searchKnowledge = async (query, topK = 5) => {
  const text = String(query || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  const limit = Math.min(Math.max(parseInt(topK, 10) || 5, 1), MAX_TOP_K);
  if (text.length < 2) return { available: true, results: [] };

  try {
    const found = rows(await db.query(
      `SELECT chunk_id, source, title, content, MATCH(title, content) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
       FROM knowledge_chunks
       WHERE MATCH(title, content) AGAINST (? IN NATURAL LANGUAGE MODE)
       ORDER BY score DESC LIMIT ?`,
      [text, text, limit]
    ));
    return {
      available: true,
      results: found.map((row) => ({
        chunkId: Number(row.chunk_id),
        source: row.source,
        title: row.title,
        content: row.content,
        score: Number(row.score)
      }))
    };
  } catch (error) {
    if (isMissingTable(error)) return { available: false, results: [] };
    throw error;
  }
};

module.exports = {
  defaultDirs,
  chunkMarkdown,
  listDocuments,
  sourceOf,
  indexDocuments,
  searchKnowledge,
  DEFAULT_CHUNK_LENGTH
};
