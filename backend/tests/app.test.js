/**
 * 应用级安全配置：helmet、CORS、请求体限制、限流、鉴权入口
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.CORS_ORIGINS = 'https://allowed.example';
process.env.LOGIN_RATE_MAX = '3';
process.env.BODY_LIMIT = '10kb';
process.env.LARGE_BODY_LIMIT = '1mb';

jest.mock('../database/db', () => ({
  query: jest.fn().mockResolvedValue([[]]),
  getConnection: jest.fn(),
  end: jest.fn()
}));

const request = require('supertest');
const app = require('../app');

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('健康检查', () => {
  const db = require('../database/db');

  test('数据库可用时返回 200', async () => {
    db.query.mockResolvedValueOnce([[{ 1: 1 }]]);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('数据库不可用时返回 503，且不泄露错误细节', async () => {
    db.query.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:3306'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error' });
  });

  test('无需登录', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).not.toBe(401);
  });
});

describe('安全响应头', () => {
  test('helmet 头已设置，且不暴露 x-powered-by', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  test('允许名单内的来源', async () => {
    const res = await request(app).get('/api/test').set('Origin', 'https://allowed.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  test('名单外的来源不返回 CORS 头', async () => {
    const res = await request(app).get('/api/test').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('鉴权入口', () => {
  test.each([
    ['/api/database/stats'],
    ['/api/files/upload'],
    ['/api/agent/terminals'],
    ['/api/jsonanalysis/list']
  ])('%s 未登录返回 401 或 404，不会放行', async (url) => {
    const res = await request(app).get(url);
    expect([401, 404]).toContain(res.status);
  });

  test('database 路由未登录返回 401', async () => {
    const res = await request(app).get('/api/database/stats');
    expect(res.status).toBe(401);
  });
});

describe('请求体大小限制', () => {
  test('普通接口超过默认限制返回 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: 'x', password: 'y'.repeat(20000) });
    expect(res.status).toBe(413);
  });

  test('jsonanalysis 使用放宽后的限制（通过限制后才进入鉴权）', async () => {
    const res = await request(app)
      .post('/api/jsonanalysis/anything')
      .send({ data: 'y'.repeat(50000) });
    expect(res.status).not.toBe(413);
  });
});

describe('登录限流', () => {
  test('连续失败超过上限后返回 429', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ phone: '13800000000', password: 'wrong' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});

describe('统一错误出口', () => {
  test('请求体不是合法 JSON：400 + JSON，不含堆栈与文件路径', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ success: false, message: '请求体不是合法的 JSON' });
    expect(res.text).not.toMatch(/node_modules|body-parser|\.js:\d+/);
  });

  test('请求体过大：413 + JSON', async () => {
    const res = await request(app).post('/api/auth/login').send({ phone: 'x', password: 'y'.repeat(20000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: '请求体过大' });
  });

  test('未知的 /api 路径：404 + JSON', async () => {
    const res = await request(app).get('/api/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: '接口不存在' });
  });

  test('URL 编码错误：不回传内部错误信息', async () => {
    const res = await request(app).get('/api/addresses/%E0%A4%A');
    expect([400, 404]).toContain(res.status);
    expect(res.text).not.toMatch(/URIError|decodeURIComponent|node_modules/);
  });

  // 错误出口是 app 栈里的最后一层，直接调用它来覆盖路由里不容易构造的情形
  const errorHandler = () => app._router.stack[app._router.stack.length - 1].handle;
  const fakeRes = () => {
    const res = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  test('未预期的异常：500 + 通用文案，不回传错误信息', () => {
    const res = fakeRes();
    errorHandler()(new Error('connect ECONNREFUSED 10.0.0.5:3306'), { method: 'GET', path: '/x' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: '服务器内部错误' });
  });

  test('其他 4xx 错误：保留状态码，文案通用', () => {
    const res = fakeRes();
    errorHandler()(Object.assign(new Error('Bad escape /etc/x'), { status: 431 }), { method: 'GET', path: '/x' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(431);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: '请求无效' });
  });

  test('响应已发出时交给 Express 默认处理', () => {
    const res = fakeRes();
    res.headersSent = true;
    const next = jest.fn();
    const err = new Error('late');
    errorHandler()(err, { method: 'GET', path: '/x' }, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
