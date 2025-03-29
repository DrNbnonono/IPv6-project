const fs = require('fs')
const path = require('path')
const { createLogger, transports } = require('winston') // Add transports to the import

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
})

const DOCS_DIR = path.join(__dirname, '../../docs/xmap')

// 获取文档列表
exports.getDocList = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    const docDir = path.join(DOCS_DIR, lang)
    
    if (!fs.existsSync(docDir)) {
      return res.status(404).json({
        success: false,
        message: 'Language not found'
      })
    }

    const files = fs.readdirSync(docDir)
    const docs = files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        id: file.replace('.md', ''),
        title: formatTitle(file.replace('.md', ''))
      }))

    res.json({
      success: true,
      docs
    })
  } catch (error) {
    logger.error('获取文档列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取文档列表失败'
    })
  }
}

// 获取文档内容
exports.getDocContent = async (req, res) => {
  try {
    const { lang, docId } = req.params
    const docPath = path.join(DOCS_DIR, lang, `${docId}.md`)
    
    if (!fs.existsSync(docPath)) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      })
    }

    const content = fs.readFileSync(docPath, 'utf-8')
    res.json({
      success: true,
      content
    })
  } catch (error) {
    logger.error('获取文档内容失败:', error)
    res.status(500).json({
      success: false,
      message: '获取文档内容失败'
    })
  }
}

// 更新文档内容
exports.updateDocContent = async (req, res) => {
  try {
    const { lang, docId } = req.params
    const { content } = req.body
    
    // 验证用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权限操作'
      })
    }

    const docPath = path.join(DOCS_DIR, lang, `${docId}.md`)
    fs.writeFileSync(docPath, content, 'utf-8')
    
    res.json({
      success: true,
      message: '文档更新成功'
    })
  } catch (error) {
    logger.error('更新文档失败:', error)
    res.status(500).json({
      success: false,
      message: '更新文档失败'
    })
  }
}

// 格式化标题 (将kebab-case转为Title Case)
function formatTitle(str) {
  return str.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}