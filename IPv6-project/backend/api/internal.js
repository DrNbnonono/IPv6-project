/**
 * 内部API调用模块
 * 用于工作流引擎调用其他服务的API
 */

const xmapController = require('../controllers/xmapController');
const zgrab2Controller = require('../controllers/zgrab2Controller');
const jsonanalysisController = require('../controllers/jsonanalysisController');

/**
 * 模拟Express请求对象
 */
function createMockRequest(data, userId) {
  return {
    body: data,
    params: {},
    query: {},
    user: { id: userId }
  };
}

/**
 * 模拟Express响应对象
 */
function createMockResponse() {
  let responseData = null;
  let statusCode = 200;

  return {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = { ...data, statusCode };
          return responseData;
        }
      };
    },
    json: (data) => {
      responseData = { ...data, statusCode };
      return responseData;
    },
    getResponse: () => responseData
  };
}

/**
 * XMap相关API
 */
const xmap = {
  async startScan(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await xmapController.scan(req, res);
    return res.getResponse();
  },

  async getTaskDetails(taskId, userId) {
    const req = createMockRequest({}, userId);
    req.params.taskId = taskId;
    const res = createMockResponse();
    
    await xmapController.getTaskDetails(req, res);
    const response = res.getResponse();
    return response.success ? response.task : response;
  },

  async cancelTask(taskId, userId) {
    const req = createMockRequest({}, userId);
    req.params.taskId = taskId;
    const res = createMockResponse();
    
    await xmapController.cancelTask(req, res);
    return res.getResponse();
  }
};

/**
 * ZGrab2相关API
 */
const zgrab2 = {
  async createTask(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await zgrab2Controller.createTask(req, res);
    return res.getResponse();
  },

  async getTaskDetails(taskId, userId) {
    const req = createMockRequest({}, userId);
    req.params.taskId = taskId;
    const res = createMockResponse();
    
    await zgrab2Controller.getTaskDetails(req, res);
    const response = res.getResponse();
    return response.success ? response.data : response;
  },

  async cancelTask(taskId, userId) {
    const req = createMockRequest({}, userId);
    req.params.taskId = taskId;
    const res = createMockResponse();
    
    await zgrab2Controller.cancelTask(req, res);
    return res.getResponse();
  }
};

/**
 * JSON分析相关API
 */
const jsonanalysis = {
  async parseFile(fileId, userId) {
    const req = createMockRequest({}, userId);
    req.params.fileId = fileId;
    const res = createMockResponse();
    
    await jsonanalysisController.parseJsonFile(req, res);
    return res.getResponse();
  },

  async extractXmapResults(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await jsonanalysisController.extractXmapResults(req, res);
    return res.getResponse();
  },

  async extractZgrab2Results(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await jsonanalysisController.extractZgrab2Results(req, res);
    return res.getResponse();
  },

  async extractFieldsFromSession(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await jsonanalysisController.extractFieldsFromSession(req, res);
    return res.getResponse();
  },

  async save(params, userId) {
    const req = createMockRequest(params, userId);
    const res = createMockResponse();
    
    await jsonanalysisController.saveProcessedJson(req, res);
    return res.getResponse();
  }
};

module.exports = {
  xmap,
  zgrab2,
  jsonanalysis
};
