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
