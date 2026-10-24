/**
 * P4-5：知识库切块、索引与检索。db 被 mock；文档用临时目录。
 */
jest.mock('../database/db', () => ({ query: jest.fn(), end: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../database/db');
const knowledge = require('../services/knowledgeService');

let dir;
beforeEach(() => {
  jest.resetAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('chunkMarkdown', () => {
  test('按标题分节，标题带上文档标题', () => {
    const chunks = knowledge.chunkMarkdown('# 文档\n\n前言\n\n## 第一节\n\n内容一\n\n## 第二节\n\n内容二');
    expect(chunks).toEqual([
      { title: '文档', content: '前言' },
      { title: '文档 > 第一节', content: '内容一' },
      { title: '文档 > 第二节', content: '内容二' }
    ]);
  });

  test('段落累积到上限再切；超长段落按句末标点切', () => {
    const para = '甲'.repeat(300);
    const chunks = knowledge.chunkMarkdown(`# T\n\n${para}\n\n${para}\n\n${para}`, { maxLength: 700 });
    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => c.content.length <= 700)).toBe(true);

    const sentences = Array.from({ length: 10 }, (_, i) => `这是第${i}句话，内容比较长一些。`).join('');
    const split = knowledge.chunkMarkdown(`# T\n\n${sentences}`, { maxLength: 60 });
    expect(split.length).toBeGreaterThan(2);
    expect(split.every((c) => c.content.length <= 60)).toBe(true);
    expect(split.map((c) => c.content).join('')).toBe(sentences);
  });

  test('没有句末标点的超长文字硬切，不丢内容', () => {
    const text = 'x'.repeat(2500);
    const chunks = knowledge.chunkMarkdown(text, { maxLength: 1000 });
    expect(chunks.map((c) => c.content).join('')).toBe(text);
  });

  test('代码块里的空行和 # 不会被当作分段或标题', () => {
    const chunks = knowledge.chunkMarkdown('# T\n\n```\n# 注释\n\nline2\n```\n\n后文');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('# 注释\n\nline2');
    expect(chunks[0].content).toContain('后文');
  });

  test('没有标题的文本：标题为占位；空文本没有块', () => {
    expect(knowledge.chunkMarkdown('只有正文')).toEqual([{ title: '（无标题）', content: '只有正文' }]);
    expect(knowledge.chunkMarkdown('')).toEqual([]);
    expect(knowledge.chunkMarkdown(null)).toEqual([]);
    expect(knowledge.chunkMarkdown('\r\n# A\r\n\r\n正文\r\n')[0]).toEqual({ title: 'A', content: '正文' });
  });
});

describe('listDocuments', () => {
  test('只取 .md / .txt，跳过隐藏文件、README.md、符号链接、过大文件，递归子目录', () => {
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, 'a.md'), '# a');
    fs.writeFileSync(path.join(dir, 'b.TXT'), 'b');
    fs.writeFileSync(path.join(dir, 'c.json'), '{}');
    fs.writeFileSync(path.join(dir, 'README.md'), '# 给维护者看的说明');
    fs.writeFileSync(path.join(dir, '.hidden.md'), 'h');
    fs.writeFileSync(path.join(dir, '.git', 'x.md'), 'g');
    fs.writeFileSync(path.join(dir, 'sub', 'd.md'), 'd');
    fs.writeFileSync(path.join(dir, 'big.md'), Buffer.alloc(1024 * 1024 + 1));
    fs.symlinkSync(path.join(dir, 'a.md'), path.join(dir, 'link.md'));
    expect(knowledge.listDocuments(dir).map((f) => path.relative(dir, f))).toEqual(['a.md', 'b.TXT', path.join('sub', 'd.md')]);
  });

  test('目录不存在返回空', () => {
    expect(knowledge.listDocuments(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('indexDocuments', () => {
  const inserts = () => db.query.mock.calls.filter(([sql]) => /^INSERT INTO knowledge_chunks/.test(sql));
  const deletes = () => db.query.mock.calls.filter(([sql]) => /^DELETE FROM knowledge_chunks WHERE source = \?/.test(sql));

  test('新文档：先删后写，按块插入', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), '# 标题\n\n## 一\n\n内容一\n\n## 二\n\n内容二');
    db.query.mockImplementation(async (sql) => (/^SELECT/.test(sql) ? [[]] : [{}]));
    const stats = await knowledge.indexDocuments([dir]);
    expect(stats).toEqual({ files: 1, indexed: 1, unchanged: 0, chunks: 2, removed: 0 });
    expect(deletes()).toHaveLength(1);
    const [sql, values] = inserts()[0];
    expect(sql).toContain('(?, ?, ?, ?, ?), (?, ?, ?, ?, ?)');
    expect(values[0]).toBe(knowledge.sourceOf(path.join(dir, 'a.md')));
    expect(values.slice(1, 4)).toEqual([0, '标题 > 一', '内容一']);
    expect(values[4]).toMatch(/^[0-9a-f]{64}$/);
  });

  test('内容没变：跳过，不写库', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), '# 标题\n\n内容');
    let stored;
    db.query.mockImplementation(async (sql, args) => {
      if (/^INSERT/.test(sql)) stored = [{ chunk_no: args[1], content_hash: args[4] }];
      return /^SELECT chunk_no/.test(sql) ? [stored || []] : /^SELECT DISTINCT/.test(sql) ? [[]] : [{}];
    });
    await knowledge.indexDocuments([dir]);
    db.query.mockClear();
    const stats = await knowledge.indexDocuments([dir]);
    expect(stats).toMatchObject({ indexed: 0, unchanged: 1, chunks: 1 });
    expect(inserts()).toHaveLength(0);
    expect(deletes()).toHaveLength(0);
  });

  test('文档改动：重新写入', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), '# 标题\n\n新内容');
    db.query.mockImplementation(async (sql) => (/^SELECT chunk_no/.test(sql) ? [[{ chunk_no: 0, content_hash: 'old' }]] : /^SELECT DISTINCT/.test(sql) ? [[]] : [{}]));
    const stats = await knowledge.indexDocuments([dir]);
    expect(stats.indexed).toBe(1);
    expect(inserts()).toHaveLength(1);
  });

  test('目录下已删除的文档被清理，其他来源不动', async () => {
    fs.writeFileSync(path.join(dir, 'keep.md'), '# K\n\n内容');
    const gone = knowledge.sourceOf(path.join(dir, 'gone.md'));
    db.query.mockImplementation(async (sql) => {
      if (/^SELECT chunk_no/.test(sql)) return [[]];
      if (/^SELECT DISTINCT/.test(sql)) return [[{ source: gone }, { source: 'elsewhere/other.md' }]];
      return [{}];
    });
    const stats = await knowledge.indexDocuments([dir]);
    expect(stats.removed).toBe(1);
    const removed = deletes().map(([, args]) => args[0]);
    expect(removed).toContain(gone);
    expect(removed).not.toContain('elsewhere/other.md');
  });

  test('超过 100 块分批插入', async () => {
    const body = Array.from({ length: 250 }, (_, i) => `## 节${i}\n\n内容${i}`).join('\n\n');
    fs.writeFileSync(path.join(dir, 'big.md'), `# 大\n\n${body}`);
    db.query.mockImplementation(async (sql) => (/^SELECT/.test(sql) ? [[]] : [{}]));
    const stats = await knowledge.indexDocuments([dir]);
    expect(stats.chunks).toBe(250);
    expect(inserts()).toHaveLength(3);
  });

  test('读不了的文档跳过，不中断', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), '# A\n\n内容');
    db.query.mockImplementation(async (sql) => (/^SELECT/.test(sql) ? [[]] : [{}]));
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => { throw new Error('EACCES'); });
    const stats = await knowledge.indexDocuments([dir]);
    spy.mockRestore();
    expect(stats).toMatchObject({ files: 1, indexed: 0 });
  });
});

describe('searchKnowledge', () => {
  test('用 ngram 全文检索，返回得分排序的结果', async () => {
    db.query.mockResolvedValue([[{ chunk_id: 3, source: 'backend/knowledge/a.md', title: 'T', content: '正文', score: '1.5' }]]);
    const result = await knowledge.searchKnowledge('什么是邻居发现', 3);
    expect(result).toEqual({ available: true, results: [{ chunkId: 3, source: 'backend/knowledge/a.md', title: 'T', content: '正文', score: 1.5 }] });
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).toContain('MATCH(title, content) AGAINST (? IN NATURAL LANGUAGE MODE)');
    expect(args).toEqual(['什么是邻居发现', '什么是邻居发现', 3]);
  });

  test('查询太短不查库；topK 被限制；查询被截断、控制字符去掉', async () => {
    expect(await knowledge.searchKnowledge('a')).toEqual({ available: true, results: [] });
    expect(await knowledge.searchKnowledge('  ')).toEqual({ available: true, results: [] });
    expect(db.query).not.toHaveBeenCalled();
    db.query.mockResolvedValue([[]]);
    await knowledge.searchKnowledge(`ab\u0000${'c'.repeat(500)}`, 999);
    const [, args] = db.query.mock.calls[0];
    expect(args[0]).toHaveLength(200);
    expect(args[0]).not.toContain('\u0000');
    expect(args[2]).toBe(10);
  });

  test('表不存在：available=false；其他错误抛出', async () => {
    db.query.mockRejectedValueOnce(Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 }));
    expect(await knowledge.searchKnowledge('邻居发现')).toEqual({ available: false, results: [] });
    db.query.mockRejectedValueOnce(new Error('connection lost'));
    await expect(knowledge.searchKnowledge('邻居发现')).rejects.toThrow('connection lost');
  });
});

describe('defaultDirs', () => {
  test('包含随仓库的 knowledge 目录与 docs 目录，KNOWLEDGE_EXTRA_DIRS 可追加', () => {
    const dirs = knowledge.defaultDirs();
    expect(dirs.some((d) => d.endsWith(path.join('backend', 'knowledge')))).toBe(true);
    expect(dirs.some((d) => d.endsWith(path.join('docs', 'xmap')))).toBe(true);
    process.env.KNOWLEDGE_EXTRA_DIRS = 'findings, /abs/dir';
    try {
      const extended = knowledge.defaultDirs();
      expect(extended.slice(-2)[1]).toBe('/abs/dir');
      expect(extended.slice(-2)[0].endsWith('findings')).toBe(true);
    } finally {
      delete process.env.KNOWLEDGE_EXTRA_DIRS;
    }
  });
});
