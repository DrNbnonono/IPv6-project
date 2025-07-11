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

// 获取文档列表
router.get('/:lang', docController.getDocList)

// 获取文档内容
router.get('/:lang/:docId', docController.getDocContent)

// 更新文档内容 (需要管理员权限)
router.put('/:lang/:docId', authenticate, docController.updateDocContent)

// 获取目录结构的API
router.get('/:lang/toc', (req, res) => {
    try {
      const lang = req.params.lang
      const toc = generateTocStructure(lang) // 实现这个函数来生成目录结构
      
      res.json({
        success: true,
        toc
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '获取目录失败'
      })
    }
  })
  
  // 生成目录结构的函数示例
  function generateTocStructure(lang) {
    // 这里可以根据实际文档结构动态生成
    // 或者从配置文件读取
    return [
      {
        id: 'home',
        title: lang === 'zh' ? '首页' : 'Home'
      },
      {
        id: 'getting-started',
        title: lang === 'zh' ? '入门指南' : 'Getting Started'
      },
      {
        id: 'global-options',
        title: lang === 'zh' ? '全局选项' : 'Global Options',
        children: [
          {
            id: 'basic-args',
            title: lang === 'zh' ? '基础参数' : 'Basic Arguments'
          },
          // 更多子项...
        ]
      }
      // 更多文档项...
    ]
  }

module.exports = router