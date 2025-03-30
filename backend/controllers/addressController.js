const db = require('../database/db');
const { createLogger, transports } = require('winston');
const { performance } = require('perf_hooks');

// 配置日志
const logger = createLogger({
  transports: [new transports.Console()]
});

// 每页默认条目数
const ITEMS_PER_PAGE = 20;

/**
 * 获取国家IPv6统计排名
 */
exports.getCountryRanking = async (req, res) => {
  try {
    const { page = 1, sort = 'total_active_ipv6', order = 'desc' } = req.query;
    const offset = (page - 1) * ITEMS_PER_PAGE;

    // 验证排序字段
    const validSortFields = ['total_active_ipv6', 'total_ipv6_prefixes'];
    if (!validSortFields.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: '无效的排序字段'
      });
    }

    // 验证排序顺序
    const validOrders = ['asc', 'desc'];
    if (!validOrders.includes(order.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: '无效的排序顺序'
      });
    }

    const [countries] = await db.query(`
      SELECT 
        country_id, 
        country_name, 
        country_name_zh,
        total_active_ipv6,
        total_ipv6_prefixes,
        latitude,
        longitude
      FROM countries
      WHERE total_active_ipv6 > 0
      ORDER BY ${sort} ${order}
      LIMIT ? OFFSET ?
    `, [ITEMS_PER_PAGE, offset]);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM countries 
      WHERE total_active_ipv6 > 0
    `);

    res.json({
      success: true,
      data: countries,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
      }
    });
  } catch (error) {
    logger.error('获取国家排名失败:', error);
    res.status(500).json({
      success: false,
      message: '获取国家排名失败'
    });
  }
};

/**
 * 获取ASN IPv6统计排名
 */
exports.getAsnRanking = async (req, res) => {
  try {
    const { page = 1, sort = 'total_active_ipv6', order = 'desc' } = req.query;
    const offset = (page - 1) * ITEMS_PER_PAGE;

    // 验证排序字段
    const validSortFields = ['total_active_ipv6', 'total_ipv6_prefixes'];
    if (!validSortFields.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: '无效的排序字段'
      });
    }

    const [asns] = await db.query(`
      SELECT 
        a.asn,
        a.as_name,
        a.as_name_zh,
        a.total_active_ipv6,
        a.total_ipv6_prefixes,
        c.country_name,
        c.country_name_zh,
        c.latitude,
        c.longitude
      FROM asns a
      JOIN countries c ON a.country_id = c.country_id
      WHERE a.total_active_ipv6 > 0
      ORDER BY ${sort} ${order}
      LIMIT ? OFFSET ?
    `, [ITEMS_PER_PAGE, offset]);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM asns 
      WHERE total_active_ipv6 > 0
    `);

    res.json({
      success: true,
      data: asns,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
      }
    });
  } catch (error) {
    logger.error('获取ASN排名失败:', error);
    res.status(500).json({
      success: false,
      message: '获取ASN排名失败'
    });
  }
};

/**
 * 获取国家详情
 */
exports.getCountryDetail = async (req, res) => {
  try {
    const { countryId } = req.params;

    // 获取国家基本信息
    const [[country]] = await db.query(`
      SELECT 
        country_id, 
        country_name, 
        country_name_zh,
        iso3_code,
        region,
        subregion,
        latitude,
        longitude,
        total_active_ipv6,
        total_ipv6_prefixes
      FROM countries
      WHERE country_id = ?
    `, [countryId]);

    if (!country) {
      return res.status(404).json({
        success: false,
        message: '国家不存在'
      });
    }

    // 获取国家下的ASN列表
    const [asns] = await db.query(`
      SELECT 
        asn, 
        as_name,
        as_name_zh,
        total_active_ipv6,
        total_ipv6_prefixes
      FROM asns
      WHERE country_id = ?
      ORDER BY total_active_ipv6 DESC
      LIMIT 10
    `, [countryId]);

    // 获取国家协议使用统计
    const [protocolStats] = await db.query(`
      SELECT 
        p.protocol_name,
        cps.percentage,
        p.description,
        p.risk_level
      FROM country_protocol_stats cps
      JOIN protocols p ON cps.protocol_id = p.protocol_id
      WHERE cps.country_id = ?
      ORDER BY cps.percentage DESC
      LIMIT 5
    `, [countryId]);

    // 获取国家漏洞统计
    const [vulnerabilityStats] = await db.query(`
      SELECT 
        v.cve_id,
        v.name,
        v.severity,
        cvs.percentage
      FROM country_vulnerability_stats cvs
      JOIN vulnerabilities v ON cvs.vulnerability_id = v.vulnerability_id
      WHERE cvs.country_id = ?
      ORDER BY cvs.percentage DESC
      LIMIT 5
    `, [countryId]);

    res.json({
      success: true,
      data: {
        ...country,
        asns,
        protocolStats,
        vulnerabilityStats
      }
    });
  } catch (error) {
    logger.error('获取国家详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取国家详情失败'
    });
  }
};

/**
 * 获取ASN详情
 */
exports.getAsnDetail = async (req, res) => {
  try {
    const { asn } = req.params;

    // 获取ASN基本信息
    const [[asnInfo]] = await db.query(`
      SELECT 
        a.asn,
        a.as_name,
        a.as_name_zh,
        a.organization,
        a.total_active_ipv6,
        a.total_ipv6_prefixes,
        c.country_id,
        c.country_name,
        c.country_name_zh,
        c.latitude,
        c.longitude
      FROM asns a
      JOIN countries c ON a.country_id = c.country_id
      WHERE a.asn = ?
    `, [asn]);

    if (!asnInfo) {
      return res.status(404).json({
        success: false,
        message: 'ASN不存在'
      });
    }

    // 获取ASN下的前缀列表
    const [prefixes] = await db.query(`
      SELECT 
        prefix_id,
        prefix,
        prefix_length,
        version,
        allocation_date,
        registry
      FROM ip_prefixes
      WHERE asn = ?
      ORDER BY prefix_length ASC
      LIMIT 50
    `, [asn]);

    // 获取ASN协议使用统计
    const [protocolStats] = await db.query(`
      SELECT 
        p.protocol_name,
        aps.percentage,
        p.description,
        p.risk_level
      FROM asn_protocol_stats aps
      JOIN protocols p ON aps.protocol_id = p.protocol_id
      WHERE aps.asn = ?
      ORDER BY aps.percentage DESC
      LIMIT 5
    `, [asn]);

    res.json({
      success: true,
      data: {
        ...asnInfo,
        prefixes,
        protocolStats
      }
    });
  } catch (error) {
    logger.error('获取ASN详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取ASN详情失败'
    });
  }
};

/**
 * 搜索IP前缀
 */
exports.searchPrefix = async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    const offset = (page - 1) * ITEMS_PER_PAGE;

    if (!query || query.length < 3) {
      return res.status(400).json({
        success: false,
        message: '搜索词至少需要3个字符'
      });
    }

    const searchTerm = `%${query}%`;

    // 搜索前缀
    const [prefixes] = await db.query(`
      SELECT 
        p.prefix_id,
        p.prefix,
        p.prefix_length,
        p.version,
        p.allocation_date,
        p.registry,
        a.asn,
        a.as_name,
        a.as_name_zh,
        c.country_id,
        c.country_name,
        c.country_name_zh
      FROM ip_prefixes p
      JOIN asns a ON p.asn = a.asn
      JOIN countries c ON p.country_id = c.country_id
      WHERE p.prefix LIKE ?
      ORDER BY p.prefix_length ASC
      LIMIT ? OFFSET ?
    `, [searchTerm, ITEMS_PER_PAGE, offset]);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM ip_prefixes 
      WHERE prefix LIKE ?
    `, [searchTerm]);

    res.json({
      success: true,
      data: prefixes,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE)
      }
    });
  } catch (error) {
    logger.error('搜索前缀失败:', error);
    res.status(500).json({
      success: false,
      message: '搜索前缀失败'
    });
  }
};

/**
 * 获取前缀详情
 */
exports.getPrefixDetail = async (req, res) => {
  try {
    const { prefixId } = req.params;

    // 获取前缀基本信息
    const [[prefix]] = await db.query(`
      SELECT 
        p.prefix_id,
        p.prefix,
        p.prefix_length,
        p.version,
        p.allocation_date,
        p.registry,
        p.is_private,
        a.asn,
        a.as_name,
        a.as_name_zh,
        c.country_id,
        c.country_name,
        c.country_name_zh
      FROM ip_prefixes p
      JOIN asns a ON p.asn = a.asn
      JOIN countries c ON p.country_id = c.country_id
      WHERE p.prefix_id = ?
    `, [prefixId]);

    if (!prefix) {
      return res.status(404).json({
        success: false,
        message: '前缀不存在'
      });
    }

    // 获取前缀下的活跃地址（不显示完整地址）
    const [addresses] = await db.query(`
      SELECT 
        address_id,
        SUBSTRING_INDEX(address, ':', 4) as partial_address,
        version,
        iid_type,
        is_router,
        is_dns_server,
        is_web_server,
        first_seen,
        last_seen,
        uptime_percentage
      FROM active_addresses
      WHERE prefix_id = ?
      ORDER BY last_seen DESC
      LIMIT 50
    `, [prefixId]);

    res.json({
      success: true,
      data: {
        ...prefix,
        addresses
      }
    });
  } catch (error) {
    logger.error('获取前缀详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取前缀详情失败'
    });
  }
};

/**
 * 获取地址详情（部分信息）
 */
exports.getAddressDetail = async (req, res) => {
  try {
    const { addressId } = req.params;

    // 获取地址基本信息（不显示完整地址）
    const [[address]] = await db.query(`
      SELECT 
        a.address_id,
        SUBSTRING_INDEX(a.address, ':', 4) as partial_address,
        a.version,
        t.type_name as iid_type_name,
        t.description as iid_description,
        t.is_risky as iid_risky,
        a.is_router,
        a.is_dns_server,
        a.is_web_server,
        a.first_seen,
        a.last_seen,
        a.uptime_percentage,
        p.prefix,
        p.prefix_length,
        p.version as prefix_version,
        asn.asn,
        asn.as_name,
        asn.as_name_zh,
        c.country_id,
        c.country_name,
        c.country_name_zh
      FROM active_addresses a
      JOIN address_types t ON a.iid_type = t.type_id
      JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
      JOIN asns asn ON p.asn = asn.asn
      JOIN countries c ON p.country_id = c.country_id
      WHERE a.address_id = ?
    `, [addressId]);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: '地址不存在'
      });
    }

    // 获取地址支持的协议
    const [protocols] = await db.query(`
      SELECT 
        p.protocol_name,
        p.protocol_number,
        p.description,
        p.risk_level,
        ap.port,
        ap.first_seen,
        ap.last_seen
      FROM address_protocols ap
      JOIN protocols p ON ap.protocol_id = p.protocol_id
      WHERE ap.address_id = ?
      ORDER BY p.protocol_name
    `, [addressId]);

    // 获取地址存在的漏洞
    const [vulnerabilities] = await db.query(`
      SELECT 
        v.cve_id,
        v.name,
        v.severity,
        v.description,
        av.detection_date,
        av.last_detected,
        av.is_fixed
      FROM address_vulnerabilities av
      JOIN vulnerabilities v ON av.vulnerability_id = v.vulnerability_id
      WHERE av.address_id = ?
      ORDER BY v.severity DESC
    `, [addressId]);

    res.json({
      success: true,
      data: {
        ...address,
        protocols,
        vulnerabilities
      }
    });
  } catch (error) {
    logger.error('获取地址详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取地址详情失败'
    });
  }
};

/**
 * 获取地图数据
 */
exports.getMapData = async (req, res) => {
  try {
    const startTime = performance.now();
    
    // 获取国家基础数据（坐标和IPv6数量）
    const [countries] = await db.query(`
      SELECT 
        country_id,
        country_name,
        country_name_zh,
        latitude,
        longitude,
        total_active_ipv6
      FROM countries
      WHERE total_active_ipv6 > 0
      ORDER BY total_active_ipv6 DESC
      LIMIT 100
    `);

    // 获取ASN基础数据
    const [asns] = await db.query(`
      SELECT 
        a.asn,
        a.as_name,
        a.as_name_zh,
        c.country_id,
        c.latitude,
        c.longitude,
        a.total_active_ipv6
      FROM asns a
      JOIN countries c ON a.country_id = c.country_id
      WHERE a.total_active_ipv6 > 0
      ORDER BY a.total_active_ipv6 DESC
      LIMIT 100
    `);

    const endTime = performance.now();
    logger.info(`地图数据查询耗时: ${(endTime - startTime).toFixed(2)}ms`);

    res.json({
      success: true,
      data: {
        countries,
        asns
      },
      meta: {
        queryTime: (endTime - startTime).toFixed(2) + 'ms'
      }
    });
  } catch (error) {
    logger.error('获取地图数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取地图数据失败'
    });
  }
};