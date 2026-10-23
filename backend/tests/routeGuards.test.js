/**
 * 路由层权限：写接口必须挂有 requireAdmin，只读接口只需登录
 */
jest.mock('../database/db', () => ({ query: jest.fn() }));
jest.mock('../controllers/databaseController', () =>
  new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) })
);
jest.mock('../controllers/docController', () =>
  new Proxy({}, { get: () => (req, res) => res.json({ ok: true }) })
);

const { requireAdmin } = require('../middleware/auth');
const databaseRouter = require('../routes/database');
const docRouter = require('../routes/doc');

const collect = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      guarded: layer.route.stack.some((s) => s.handle === requireAdmin)
    }));

describe('/api/database 路由权限', () => {
  const routes = collect(databaseRouter);

  test('所有 POST/PUT/DELETE（除高级查询）都要求管理员', () => {
    const unguarded = routes.filter(
      (r) =>
        r.path !== '/advanced-query' &&
        r.methods.some((m) => ['post', 'put', 'delete'].includes(m)) &&
        !r.guarded
    );
    expect(unguarded).toEqual([]);
  });

  test('所有 import-tasks 路由都要求管理员', () => {
    const importRoutes = routes.filter((r) => r.path.startsWith('/import-tasks'));
    expect(importRoutes.length).toBe(5);
    expect(importRoutes.every((r) => r.guarded)).toBe(true);
  });

  test('只读 GET 接口不要求管理员', () => {
    const stats = routes.find((r) => r.path === '/stats');
    expect(stats.guarded).toBe(false);
  });
});

describe('/api/docs 路由权限', () => {
  test('文档更新接口要求管理员', () => {
    const updates = collect(docRouter).filter((r) => r.methods.includes('put'));
    expect(updates.length).toBe(2);
    expect(updates.every((r) => r.guarded)).toBe(true);
  });
});
