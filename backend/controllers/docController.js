const fs = require('fs')
const path = require('path')
const { createLogger, transports } = require('winston') // Add transports to the import

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
})

const XMAP_DOCS_DIR = path.join(__dirname, '../../docs/xmap')
const ZGRAB2_DOCS_DIR = path.join(__dirname, '../../docs/zgrab2')

// 获取文档列表
exports.getDocList = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    const docDir = path.join(XMAP_DOCS_DIR, lang)
    
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
    const docPath = path.join(XMAP_DOCS_DIR, lang, `${docId}.md`)
    
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

    const docPath = path.join(XMAP_DOCS_DIR, lang, `${docId}.md`)
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

// ========== ZGrab2 文档相关函数 ==========

// 获取ZGrab2文档列表
exports.getZgrab2DocList = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    const docDir = path.join(ZGRAB2_DOCS_DIR, lang)
    
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
    logger.error('获取ZGrab2文档列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取ZGrab2文档列表失败'
    })
  }
}

// 获取ZGrab2文档内容
exports.getZgrab2DocContent = async (req, res) => {
  try {
    const { lang, docId } = req.params
    const docDir = path.join(ZGRAB2_DOCS_DIR, lang)
    
    if (!fs.existsSync(docDir)) {
      return res.status(404).json({
        success: false,
        message: 'Language not found'
      })
    }

    // 获取目录中的所有文件
    const files = fs.readdirSync(docDir)
    
    // 查找匹配的文件（不区分大小写）
    const targetFile = files.find(file => 
      file.toLowerCase().replace('.md', '') === docId.toLowerCase()
    )
    
    if (!targetFile) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      })
    }

    const docPath = path.join(docDir, targetFile)
    const content = fs.readFileSync(docPath, 'utf-8')
    
    res.json({
      success: true,
      content
    })
  } catch (error) {
    logger.error('获取ZGrab2文档内容失败:', error)
    res.status(500).json({
      success: false,
      message: '获取ZGrab2文档内容失败'
    })
  }
}

// 更新ZGrab2文档内容
exports.updateZgrab2DocContent = async (req, res) => {
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

    const docDir = path.join(ZGRAB2_DOCS_DIR, lang)
    
    if (!fs.existsSync(docDir)) {
      return res.status(404).json({
        success: false,
        message: 'Language not found'
      })
    }

    // 获取目录中的所有文件
    const files = fs.readdirSync(docDir)
    
    // 查找匹配的文件（不区分大小写）
    const targetFile = files.find(file => 
      file.toLowerCase().replace('.md', '') === docId.toLowerCase()
    )
    
    if (!targetFile) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      })
    }

    const docPath = path.join(docDir, targetFile)
    fs.writeFileSync(docPath, content, 'utf-8')
    
    res.json({
      success: true,
      message: 'ZGrab2文档更新成功'
    })
  } catch (error) {
    logger.error('更新ZGrab2文档失败:', error)
    res.status(500).json({
      success: false,
      message: '更新ZGrab2文档失败'
    })
  }
}

// 获取ZGrab2目录结构
exports.getZgrab2Toc = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    const toc = generateZgrab2TocStructure(lang)
    
    res.json({
      success: true,
      toc
    })
  } catch (error) {
    logger.error('获取ZGrab2目录失败:', error)
    res.status(500).json({
      success: false,
      message: '获取ZGrab2目录失败'
    })
  }
}

// 获取ZGrab2支持的模块列表
exports.getZgrab2SupportedModules = async (req, res) => {
  try {
    const modules = [
      { module: 'amqp091', defaultPort: '5672', description: 'AMQP 0.9.1 Protocol' },
      { module: 'bacnet', defaultPort: '47808', description: 'BACnet Protocol' },
      { module: 'banner', defaultPort: 'N/A', description: 'Banner Grab' },
      { module: 'dnp3', defaultPort: '20000', description: 'DNP3 Protocol' },
      { module: 'fox', defaultPort: '1911', description: 'Fox Protocol' },
      { module: 'ftp', defaultPort: '21', description: 'FTP Protocol' },
      { module: 'http', defaultPort: '80', description: 'HTTP Banner Grab' },
      { module: 'imap', defaultPort: '143', description: 'IMAP Protocol' },
      { module: 'ipp', defaultPort: '631', description: 'IPP Protocol' },
      { module: 'jarm', defaultPort: '443', description: 'JARM Fingerprinting' },
      { module: 'modbus', defaultPort: '502', description: 'Modbus Protocol' },
      { module: 'mongodb', defaultPort: '27017', description: 'MongoDB Protocol' },
      { module: 'mqtt', defaultPort: '1883', description: 'MQTT Protocol' },
      { module: 'mssql', defaultPort: '1433', description: 'MSSQL Protocol' },
      { module: 'multiple', defaultPort: 'N/A', description: 'Multiple Module Actions' },
      { module: 'mysql', defaultPort: '3306', description: 'MySQL Protocol' },
      { module: 'ntp', defaultPort: '123', description: 'NTP Protocol' },
      { module: 'oracle', defaultPort: '1521', description: 'Oracle Protocol' },
      { module: 'pop3', defaultPort: '110', description: 'POP3 Protocol' },
      { module: 'postgres', defaultPort: '5432', description: 'PostgreSQL Protocol' },
      { module: 'pptp', defaultPort: '1723', description: 'PPTP Protocol' },
      { module: 'redis', defaultPort: '6379', description: 'Redis Protocol' },
      { module: 'siemens', defaultPort: '102', description: 'Siemens S7 Protocol' },
      { module: 'smb', defaultPort: '445', description: 'SMB Protocol' },
      { module: 'smtp', defaultPort: '25', description: 'SMTP Protocol' },
      { module: 'socks5', defaultPort: '1080', description: 'SOCKS5 Protocol' },
      { module: 'ssh', defaultPort: '22', description: 'SSH Banner Grab' },
      { module: 'telnet', defaultPort: '23', description: 'Telnet Protocol' },
      { module: 'tls', defaultPort: '443', description: 'TLS Banner Grab' }
    ]

    res.json({
      success: true,
      modules
    })
  } catch (error) {
    logger.error('获取ZGrab2模块列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取ZGrab2模块列表失败'
    })
  }
}

// 生成ZGrab2目录结构
function generateZgrab2TocStructure(lang) {
  const isZh = lang === 'zh'
  
  return [
    { id: 'Home', title: isZh ? '首页' : 'Home' },
    { id: 'BaseFlags', title: isZh ? '基础标志' : 'Base Flags' },
    { id: 'TLSFlags', title: isZh ? 'TLS标志' : 'TLS Flags' },
    { 
      title: isZh ? '协议模块' : 'Protocols',
      children: [
        { id: 'FTP', title: 'FTP' },
        { id: 'HTTP', title: 'HTTP' },
        { id: 'MSSQL', title: 'MSSQL' },
        { id: 'MySQL', title: 'MySQL' }
      ]
    },
    { 
      title: isZh ? '开发指南' : 'Development',
      children: [
        { id: 'Performance-Tuning', title: isZh ? '性能调优' : 'Performance Tuning' },
        { id: 'Adding-new-modules', title: isZh ? '添加新模块' : 'Adding New Modules' },
        { id: 'Scanner-details', title: isZh ? '扫描器详情' : 'Scanner Details' },
        { id: 'Integration-test-details', title: isZh ? '集成测试详情' : 'Integration Test Details' },
        { id: 'Schema-details', title: isZh ? '架构详情' : 'Schema Details' }
      ]
    }
  ]
}

// 格式化标题 (将kebab-case转为Title Case)
function formatTitle(str) {
  return str.split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}