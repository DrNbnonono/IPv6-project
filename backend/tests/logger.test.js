/**
 * loggerService：脱敏、console 风格参数格式化、模块日志器输出。
 */
const { Writable } = require('stream');
const { transports, format } = require('winston');
const {
  createModuleLogger,
  maskSensitive,
  maskString,
  formatLogArgs,
  _getRootLogger,
  _reset
} = require('../services/loggerService');

describe('maskSensitive', () => {
  test('遮蔽常见敏感键，保留其他字段', () => {
    const out = maskSensitive({
      phone: '13800000000',
      password: 'p@ss',
      newPassword: 'x',
      token: 'abc',
      accessToken: 'abc',
      headers: { Authorization: 'Bearer abc.def', cookie: 'sid=1', 'x-api-key': 'k', host: 'a' },
      llm: { apiKey: 'sk-1', model: 'm' }
    });
    expect(out.phone).toBe('13800000000');
    expect(out.password).toBe('***');
    expect(out.newPassword).toBe('***');
    expect(out.token).toBe('***');
    expect(out.accessToken).toBe('***');
    expect(out.headers.Authorization).toBe('***');
    expect(out.headers.cookie).toBe('***');
    expect(out.headers['x-api-key']).toBe('***');
    expect(out.headers.host).toBe('a');
    expect(out.llm.apiKey).toBe('***');
    expect(out.llm.model).toBe('m');
  });

  test('用量统计类字段（*_tokens）不被遮蔽', () => {
    const out = maskSensitive({ total_tokens: 12, max_tokens: 100, token: 't' });
    expect(out.total_tokens).toBe(12);
    expect(out.max_tokens).toBe(100);
    expect(out.token).toBe('***');
  });

  test('不修改入参，数组与嵌套都会处理', () => {
    const input = { list: [{ password: 'a' }, { n: 1 }] };
    const out = maskSensitive(input);
    expect(input.list[0].password).toBe('a');
    expect(out.list[0].password).toBe('***');
    expect(out.list[1].n).toBe(1);
  });

  test('循环引用与超深嵌套不会崩溃', () => {
    const a = { name: 'a' };
    a.self = a;
    expect(maskSensitive(a).self).toBe('[Circular]');

    let deep = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(() => maskSensitive(deep)).not.toThrow();
    expect(JSON.stringify(maskSensitive(deep))).toContain('[Truncated]');
  });

  test('Error 保留 name/message/stack，字符串中的 token 被遮蔽', () => {
    const err = new Error('failed with Bearer abc.def.ghi');
    err.code = 'E1';
    const out = maskSensitive(err);
    expect(out.name).toBe('Error');
    expect(out.message).toBe('failed with Bearer ***');
    expect(out.stack).not.toContain('abc.def.ghi');
    expect(out.code).toBe('E1');
  });

  test('Buffer 与 Date 的处理', () => {
    expect(maskSensitive(Buffer.from('secret-data'))).toBe('[Buffer 11 bytes]');
    expect(maskSensitive(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
  });

  test('超长数组被截断', () => {
    const out = maskSensitive(Array.from({ length: 500 }, (_, i) => i));
    expect(out).toHaveLength(201);
    expect(out[200]).toBe('[+300 more]');
  });
});

describe('maskString', () => {
  test.each([
    ['Authorization: Bearer abc.def', 'abc.def'],
    ['login password=hunter2 ok', 'hunter2'],
    ['{"password":"hunter2"}', 'hunter2'],
    ['token: abcdef123', 'abcdef123'],
    ['GET /x?api_key=sk-12345&a=1', 'sk-12345']
  ])('%s', (input, secret) => {
    const out = maskString(input);
    expect(out).not.toContain(secret);
    expect(out).toContain('***');
  });

  test('普通文本保持不变', () => {
    expect(maskString('任务 12 已完成')).toBe('任务 12 已完成');
  });
});

describe('formatLogArgs', () => {
  test('多参数风格与 console.log 一致', () => {
    expect(formatLogArgs(['创建任务', 5, 'ok'])).toBe('创建任务 5 ok');
    expect(formatLogArgs(['id=%d name=%s', 3, 'x'])).toBe('id=3 name=x');
  });

  test('对象参数被展开且脱敏', () => {
    const out = formatLogArgs(['请求:', { id: 1, password: 'p' }]);
    expect(out).toContain('id: 1');
    expect(out).toContain("password: '***'");
    expect(out).not.toContain("'p'");
  });

  test('Error 参数输出堆栈', () => {
    const out = formatLogArgs(['失败:', new Error('boom')]);
    expect(out).toContain('失败:');
    expect(out).toContain('Error: boom');
    expect(out).toContain('at ');
  });

  test('空参数返回空串', () => {
    expect(formatLogArgs([])).toBe('');
  });
});

describe('createModuleLogger', () => {
  let lines;
  const saved = { ...process.env };

  beforeEach(() => {
    _reset();
    process.env.LOG_LEVEL = 'debug';
    lines = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(JSON.parse(chunk.toString()));
        cb();
      }
    });
    _getRootLogger().add(new transports.Stream({ stream, format: format.json() }));
  });

  afterEach(() => {
    _reset();
    process.env = { ...saved };
  });

  test('输出带 module 字段，且参数已脱敏', () => {
    const logger = createModuleLogger('unit');
    logger.info('登录', { phone: '138', password: 'secret-pw', note: 'Bearer abc.def' });
    expect(lines).toHaveLength(1);
    expect(lines[0].module).toBe('unit');
    expect(lines[0].level).toBe('info');
    expect(lines[0].message).toContain('登录');
    expect(lines[0].message).not.toContain('secret-pw');
    expect(lines[0].message).not.toContain('abc.def');
  });

  test('error 级别输出 Error 堆栈', () => {
    createModuleLogger('unit').error('出错:', new Error('boom'));
    expect(lines[0].level).toBe('error');
    expect(lines[0].message).toContain('Error: boom');
  });

  test('debug 级别在 LOG_LEVEL=info 时被过滤', () => {
    _reset();
    process.env.LOG_LEVEL = 'info';
    const stream = new Writable({
      write(chunk, _e, cb) {
        lines.push(JSON.parse(chunk.toString()));
        cb();
      }
    });
    _getRootLogger().add(new transports.Stream({ stream, format: format.json() }));
    const logger = createModuleLogger('unit');
    logger.debug('不应出现');
    logger.warn('应出现');
    expect(lines.map((l) => l.level)).toEqual(['warn']);
  });

  test('测试环境默认静默，不创建日志文件', () => {
    _reset();
    process.env.LOG_LEVEL = 'info';
    const root = _getRootLogger();
    expect(root.transports).toHaveLength(1);
    expect(root.transports[0].silent).toBe(true);
  });
});

describe('LOG_TO_STDERR（stdio 程序的 stdout 是协议通道）', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const buildConsoleTransport = (env) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ov6-log-'));
    const saved = {};
    const set = { NODE_ENV: 'development', PROJECT_ROOT: root, ...env };
    for (const [key, value] of Object.entries(set)) {
      saved[key] = process.env[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    try {
      let transport;
      jest.isolateModules(() => {
        const fresh = require('../services/loggerService');
        transport = fresh._getRootLogger().transports.find((t) => t.name === 'console');
        fresh._getRootLogger().close();
      });
      return transport;
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  test('设置后所有级别都写 stderr；默认不设置', () => {
    expect(buildConsoleTransport({ LOG_TO_STDERR: '1' }).stderrLevels).toMatchObject({ error: true, info: true, debug: true });
    expect(Object.keys(buildConsoleTransport({ LOG_TO_STDERR: undefined }).stderrLevels || {})).toHaveLength(0);
  });
});
