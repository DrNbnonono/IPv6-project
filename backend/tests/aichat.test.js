/**
 * /api/ai/detection/chat 面向未登录访客，调用的是服务器配置的大模型额度：
 * 需要有专用限流和输入长度上限。这里不发起任何外部请求（超限/非法输入在调用模型之前就返回）。
 */
process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.AI_RATE_MAX = '4';
process.env.API_RATE_MAX = '1000';

jest.mock('../database/db', () => ({
  query: jest.fn().mockResolvedValue([[]]),
  getConnection: jest.fn(),
  end: jest.fn()
}));
jest.mock('axios');

const axios = require('axios');
const request = require('supertest');
const app = require('../app');

describe('AI 问答的输入上限与限流', () => {
  test('超长问题返回 400，且不调用模型', async () => {
    const res = await request(app).post('/api/ai/detection/chat').send({ message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/过长/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('空问题返回 400', async () => {
    const res = await request(app).post('/api/ai/detection/chat').send({ message: '  ' });
    expect(res.status).toBe(400);
  });

  test('超过 AI_RATE_MAX 后返回 429；其他接口不受该限流影响', async () => {
    // 前两次请求（上面两个用例）已计数，再发两次到达上限，第 5 次被拒绝
    await request(app).post('/api/ai/detection/chat').send({ message: '' });
    await request(app).post('/api/ai/detection/chat').send({ message: '' });
    const limited = await request(app).post('/api/ai/detection/chat').send({ message: '' });
    expect(limited.status).toBe(429);
    expect(limited.body.success).toBe(false);

    const other = await request(app).get('/api/ai/status');
    expect(other.status).not.toBe(429);
    const health = await request(app).get('/api/health');
    expect(health.status).not.toBe(429);
  });
});
