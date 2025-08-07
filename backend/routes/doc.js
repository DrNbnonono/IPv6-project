const express = require('express')
const router = express.Router()
const docController = require('../controllers/docController')
const { authenticate } = require('../middleware/auth')

// ========== ZGrab2 文档相关路由 ==========
// 注意：这些路由必须在XMap路由之前，以避免路由冲突

// 获取ZGrab2支持的模块列表
router.get('/zgrab2/modules', docController.getZgrab2SupportedModules)

// 获取ZGrab2目录结构
router.get('/zgrab2/:lang/toc', docController.getZgrab2Toc)

// 获取ZGrab2文档列表
router.get('/zgrab2/:lang', docController.getZgrab2DocList)

// 获取ZGrab2文档内容
router.get('/zgrab2/:lang/:docId', docController.getZgrab2DocContent)

// 更新ZGrab2文档内容 (需要管理员权限)
router.put('/zgrab2/:lang/:docId', authenticate, docController.updateZgrab2DocContent)

// ========== XMap 文档相关路由 ==========

// 获取XMap目录结构 (必须在通用路由之前)
router.get('/:lang/toc', docController.getXmapToc)

// 获取文档列表
router.get('/:lang', docController.getDocList)

// 获取文档内容
router.get('/:lang/:docId', docController.getDocContent)

// 更新文档内容 (需要管理员权限)
router.put('/:lang/:docId', authenticate, docController.updateDocContent)

module.exports = router