/**
 * SQL 只读查询防护（高级查询的临时防线，P0-4 的结构化查询构建器上线后将被取代）
 * 规则：
 *  1. 只允许单条 SELECT 语句
 *  2. 禁止注释、分号、用户变量、INTO 输出
 *  3. 禁止写操作关键字、时间/文件类危险函数
 *  4. 禁止访问 users 表及系统库
 * 字符串字面量内的内容不参与检查，因此 WHERE x = 'delete' 之类的合法查询不会被误拦。
 */

const FORBIDDEN_WORDS = [
  'DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT', 'REPLACE', 'CREATE', 'ALTER',
  'GRANT', 'REVOKE', 'RENAME', 'CALL', 'EXECUTE', 'PREPARE', 'HANDLER', 'LOAD', 'LOCK',
  'INTO', 'OUTFILE', 'DUMPFILE',
  'SLEEP', 'BENCHMARK', 'LOAD_FILE', 'GET_LOCK', 'RELEASE_LOCK', 'MASTER_POS_WAIT'
];

const FORBIDDEN_SCHEMAS = [
  'USERS', 'INFORMATION_SCHEMA', 'MYSQL', 'PERFORMANCE_SCHEMA', 'SYS'
];

/**
 * 把查询拆成“代码部分”：字符串字面量替换为占位符，反引号标识符保留其名字。
 * 返回 null 表示引号未闭合。
 */
const stripLiterals = (query) => {
  let code = '';
  let i = 0;
  while (i < query.length) {
    const ch = query[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let content = '';
      i += 1;
      let closed = false;
      while (i < query.length) {
        const current = query[i];
        if (quote !== '`' && current === '\\') {
          i += 2;
          continue;
        }
        if (current === quote) {
          if (query[i + 1] === quote) {
            content += quote;
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        content += current;
        i += 1;
      }
      if (!closed) {
        return null;
      }
      code += quote === '`' ? ` ${content} ` : ' ? ';
      continue;
    }
    code += ch;
    i += 1;
  }
  return code;
};

const isReadOnlySelect = (query) => {
  if (typeof query !== 'string' || !query.trim() || query.length > 20000) {
    return false;
  }

  const code = stripLiterals(query);
  if (code === null) {
    return false;
  }

  if (/;|--|#|\/\*|\*\/|@/.test(code)) {
    return false;
  }

  const upper = code.toUpperCase();

  if (!/^[\s(]*SELECT\b/.test(upper)) {
    return false;
  }

  const words = upper.match(/[A-Z_][A-Z0-9_$]*/g) || [];
  const wordSet = new Set(words);

  if (FORBIDDEN_WORDS.some((word) => wordSet.has(word))) {
    return false;
  }

  if (FORBIDDEN_SCHEMAS.some((name) => wordSet.has(name))) {
    return false;
  }

  return true;
};

module.exports = {
  isReadOnlySelect
};
