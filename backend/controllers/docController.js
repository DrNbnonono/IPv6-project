const fs = require('fs')
const path = require('path')
const { createLogger, transports } = require('winston') // Add transports to the import

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
})

const XMAP_DOCS_DIR = path.join(__dirname, '../../docs/xmap')
const ZGRAB2_DOCS_DIR = path.join(__dirname, '../../docs/zgrab2')
const ALLOWED_LANGS = new Set(['en', 'zh'])
const DOC_ID_PATTERN = /^[A-Za-z0-9-]+$/

function isValidLang(lang) {
  return ALLOWED_LANGS.has(lang)
}

function isValidDocId(docId) {
  return DOC_ID_PATTERN.test(docId)
}

function resolveSafePath(baseDir, ...segments) {
  const resolvedBase = path.resolve(baseDir)
  const resolvedPath = path.resolve(baseDir, ...segments)
  const basePrefix = `${resolvedBase}${path.sep}`

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(basePrefix)) {
    throw new Error('非法文档路径')
  }

  return resolvedPath
}

function findMatchingMarkdownFile(docDir, docId) {
  const files = fs.readdirSync(docDir)

  return files.find(file => {
    const lowerFile = file.toLowerCase()
    return lowerFile.endsWith('.md') && lowerFile.replace('.md', '') === docId.toLowerCase()
  })
}

function sendInvalidParams(res) {
  return res.status(400).json({
    success: false,
    message: '无效的文档参数'
  })
}

// 获取文档列表
exports.getDocList = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    if (!isValidLang(lang)) {
      return sendInvalidParams(res)
    }

    const docDir = resolveSafePath(XMAP_DOCS_DIR, lang)
    
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

// 获取XMap目录结构
exports.getXmapToc = async (req, res) => {
  try {
    const lang = req.params.lang || 'en'
    if (!isValidLang(lang)) {
      return sendInvalidParams(res)
    }

    const toc = generateXmapTocStructure(lang)

    res.json({
      success: true,
      toc
    })
  } catch (error) {
    logger.error('获取XMap目录失败:', error)
    res.status(500).json({
      success: false,
      message: '获取XMap目录失败'
    })
  }
}

// 获取文档内容
exports.getDocContent = async (req, res) => {
  try {
    const { lang, docId } = req.params
    if (!isValidLang(lang) || !isValidDocId(docId)) {
      return sendInvalidParams(res)
    }

    const docPath = resolveSafePath(XMAP_DOCS_DIR, lang, `${docId}.md`)

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
    if (!isValidLang(lang) || !isValidDocId(docId)) {
      return sendInvalidParams(res)
    }
    
    // 验证用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权限操作'
      })
    }

    const docPath = resolveSafePath(XMAP_DOCS_DIR, lang, `${docId}.md`)
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
    if (!isValidLang(lang)) {
      return sendInvalidParams(res)
    }

    const docDir = resolveSafePath(ZGRAB2_DOCS_DIR, lang)
    
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
    if (!isValidLang(lang) || !isValidDocId(docId)) {
      return sendInvalidParams(res)
    }

    const docDir = resolveSafePath(ZGRAB2_DOCS_DIR, lang)
    
    if (!fs.existsSync(docDir)) {
      return res.status(404).json({
        success: false,
        message: 'Language not found'
      })
    }

    // 获取目录中的所有文件
    const targetFile = findMatchingMarkdownFile(docDir, docId)
    
    if (!targetFile) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      })
    }

    const docPath = resolveSafePath(docDir, targetFile)
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
    if (!isValidLang(lang) || !isValidDocId(docId)) {
      return sendInvalidParams(res)
    }
    
    // 验证用户权限
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '无权限操作'
      })
    }

    const docDir = resolveSafePath(ZGRAB2_DOCS_DIR, lang)
    
    if (!fs.existsSync(docDir)) {
      return res.status(404).json({
        success: false,
        message: 'Language not found'
      })
    }

    // 获取目录中的所有文件
    const targetFile = findMatchingMarkdownFile(docDir, docId)
    
    if (!targetFile) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      })
    }

    const docPath = resolveSafePath(docDir, targetFile)
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
    if (!isValidLang(lang)) {
      return sendInvalidParams(res)
    }

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

// 生成XMap目录结构
function generateXmapTocStructure(lang) {
  const isZh = lang === 'zh'

  return [
    { id: 'home', title: isZh ? '首页' : 'Home' },
    { id: 'getting-started', title: isZh ? '入门指南' : 'Getting Started' },
    { id: 'Installing-XMap', title: isZh ? '安装XMap' : 'Installing XMap' },
    {
      title: isZh ? '全局选项' : 'Global Options',
      children: [
        { id: 'Basic-Arguments', title: isZh ? '基础参数' : 'Basic Arguments' },
        { id: 'Scan-Options', title: isZh ? '扫描选项' : 'Scan Options' },
        { id: 'Network-Options', title: isZh ? '网络选项' : 'Network Options' },
        { id: 'Additional-Options', title: isZh ? '附加选项' : 'Additional Options' },
        { id: 'Logging-and-Metadata', title: isZh ? '日志和元数据' : 'Logging and Metadata' }
      ]
    },
    {
      title: isZh ? '探测选项' : 'Probe Options',
      children: [
        { id: 'TCP-SYN-Probe-Module', title: isZh ? 'TCP SYN探测模块' : 'TCP SYN Probe Module' },
        { id: 'UDP-Probe-Module', title: isZh ? 'UDP探测模块' : 'UDP Probe Module' },
        { id: 'ICMP-Echo-Probe-Module', title: isZh ? 'ICMP Echo探测模块' : 'ICMP Echo Probe Module' },
        { id: 'DNS-Probe-Module', title: isZh ? 'DNS探测模块' : 'DNS Probe Module' }
      ]
    },
    { id: 'Output-Modules', title: isZh ? '输出模块' : 'Output Modules' },
    { id: 'IID-Modules', title: isZh ? 'IID模块' : 'IID Modules' },
    { id: 'Scanning-Best-Practices', title: isZh ? '扫描最佳实践' : 'Scanning Best Practices' },
    { id: 'Virtual-Machine-Configuration', title: isZh ? '虚拟机配置' : 'Virtual Machine Configuration' },
    { id: 'Writing-Modules', title: isZh ? '编写模块' : 'Writing Modules' },
    { id: 'XMap-in-Academic-Research', title: isZh ? '学术研究中的XMap' : 'XMap in Academic Research' }
  ]
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
