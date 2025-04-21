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
    const { sort = 'total_active_ipv6', order = 'desc' } = req.query;

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

    // 初始化变量
    await db.query('SET @row_number = 0');
    
    // 修改SQL查询，移除LIMIT和OFFSET，添加排名
    const [countries] = await db.query(`
      SELECT 
        country_id, 
        country_name, 
        country_name_zh,
        total_active_ipv6,
        total_ipv6_prefixes,
        latitude,
        longitude,
        @row_number := @row_number + 1 AS \`rank\`
      FROM countries
      ORDER BY ${sort} ${order}
    `);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM countries 
    `);

    res.json({
      success: true,
      data: countries,
      total
    });
  } catch (error) {
    logger.error('获取国家排名失败:', error);
    console.error('获取国家排名详细错误:', error.message, error.stack);
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
    const { sort = 'total_active_ipv6', order = 'desc' } = req.query;

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

    // 初始化变量
    await db.query('SET @row_number = 0');
    
    // 修复SQL查询，使用正确的MySQL语法
    const [asns] = await db.query(`
      SELECT 
        a.asn,
        a.as_name,
        a.as_name_zh,
        a.country_id,
        a.total_active_ipv6,
        a.total_ipv6_prefixes,
        c.country_name,
        c.country_name_zh,
        c.latitude,
        c.longitude,
        @row_number := @row_number + 1 AS \`rank\`
      FROM asns a
      JOIN countries c ON a.country_id = c.country_id
      ORDER BY a.${sort} ${order}
    `);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM asns 
    `);

    res.json({
      success: true,
      data: asns,
      total
    });
  } catch (error) {
    logger.error('获取ASN排名失败:', error);
    console.error('获取ASN排名详细错误:', error.message, error.stack);
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
    const prefixId = parseInt(req.params.prefixId);
    
    // 验证前缀ID
    if (isNaN(prefixId)) {
      return res.status(400).json({
        success: false,
        message: '无效的前缀ID'
      });
    }
    
    // 获取前缀基本信息
    const [prefixInfo] = await db.query(`
      SELECT 
        ip.prefix_id,
        ip.prefix,
        ip.prefix_length,
        ip.version,
        ip.asn,
        a.as_name,
        a.as_name_zh,
        ip.country_id,
        c.country_name,
        c.country_name_zh,
        ip.allocation_date,
        ip.registry,
        COUNT(aa.address_id) AS active_addresses
      FROM ip_prefixes ip
      LEFT JOIN asns a ON ip.asn = a.asn
      LEFT JOIN countries c ON ip.country_id = c.country_id
      LEFT JOIN active_addresses aa ON ip.prefix_id = aa.prefix_id
      WHERE ip.prefix_id = ?
      GROUP BY ip.prefix_id
    `, [prefixId]);
    
    if (prefixInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到前缀信息'
      });
    }
    
    // 获取前缀的地址列表（限制1000条）
    const [addressList] = await db.query(`
      SELECT 
        aa.address_id,
        aa.address,
        at.type_name AS iid_type,
        at.is_risky
      FROM active_addresses aa
      LEFT JOIN address_types at ON aa.iid_type = at.type_id
      WHERE aa.prefix_id = ?
      ORDER BY aa.last_seen DESC
      LIMIT 1000
    `, [prefixId]);
    
    // 获取每个地址的协议信息
    if (addressList.length > 0) {
      const addressIds = addressList.map(addr => addr.address_id);
      const addressIdsStr = addressIds.join(',');
      
      // 获取所有地址的协议信息
      const [protocolsData] = await db.query(`
        SELECT 
          ap.address_id,
          p.protocol_id,
          p.protocol_name,
          p.description,
          p.risk_level,
          ap.port
        FROM address_protocols ap
        JOIN protocols p ON ap.protocol_id = p.protocol_id
        WHERE ap.address_id IN (${addressIdsStr})
      `);
      
      // 获取所有地址的漏洞信息
      const [vulnerabilitiesData] = await db.query(`
        SELECT 
          av.address_id,
          v.vulnerability_id,
          v.cve_id,
          v.name,
          v.severity,
          av.is_fixed
        FROM address_vulnerabilities av
        JOIN vulnerabilities v ON av.vulnerability_id = v.vulnerability_id
        WHERE av.address_id IN (${addressIdsStr})
      `);
      
      // 将协议和漏洞信息关联到各个地址
      addressList.forEach(address => {
        // 添加协议信息
        address.protocols = protocolsData.filter(p => p.address_id === address.address_id)
          .map(p => ({
            protocol_id: p.protocol_id,
            protocol_name: p.protocol_name,
            description: p.description,
            risk_level: p.risk_level,
            port: p.port
          }));
        
        // 添加漏洞信息
        address.vulnerabilities = vulnerabilitiesData.filter(v => v.address_id === address.address_id)
          .map(v => ({
            vulnerability_id: v.vulnerability_id,
            cve_id: v.cve_id,
            name: v.name,
            severity: v.severity,
            is_fixed: v.is_fixed
          }));
      });
    }
    
    // 获取IID类型分布
    const [iidDistribution] = await db.query(`
      SELECT 
        at.type_name,
        at.is_risky,
        COUNT(aa.address_id) AS address_count
      FROM active_addresses aa
      JOIN address_types at ON aa.iid_type = at.type_id
      WHERE aa.prefix_id = ?
      GROUP BY at.type_id
      ORDER BY address_count DESC
    `, [prefixId]);
    
    res.json({
      success: true,
      data: {
        prefix: prefixInfo[0],
        addresses: addressList,
        iidDistribution: iidDistribution,
        totalAddresses: prefixInfo[0].active_addresses,
        limitApplied: prefixInfo[0].active_addresses > 1000
      }
    });
  } catch (error) {
    logger.error(`获取前缀 ${req.params.prefixId} 详情失败:`, error);
    console.error('详细错误:', error.message, error.stack);
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
        iso3_code,
        latitude,
        longitude,
        total_active_ipv6
      FROM countries
      ORDER BY country_name DESC
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
      ORDER BY asn DESC
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


/**
 * 通用搜索功能 - 搜索国家、ASN和前缀
 */
exports.searchIPv6 = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.trim() === '') {
      return res.json({
        success: true,
        data: [],
        message: '搜索词为空，请输入有效的搜索内容'
      });
    }
    
    const startTime = performance.now();
    logger.info(`开始搜索: ${query}`);
    
    // 确定搜索类型
    const searchType = determineSearchType(query);
    let results = [];
    
    // 根据搜索类型执行不同的搜索策略
    if (searchType === 'country_code') {
      // 国家代码搜索 - 只搜索国家表，精确匹配
      const [countryResults] = await db.query(`
        SELECT 
          'country' as type, 
          country_id, 
          country_name, 
          country_name_zh, 
          total_active_ipv6
        FROM 
          countries
        WHERE 
          country_id = ?
        LIMIT 1
      `, [query.toUpperCase()]);
      
      logger.info(`国家代码搜索结果: ${countryResults.length} 条`);
      results = countryResults;
    } 
    else if (searchType === 'name') {
      // 名称搜索 - 先尝试精确匹配国家名称
      const [exactCountryResults] = await db.query(`
        SELECT 
          'country' as type, 
          country_id, 
          country_name, 
          country_name_zh, 
          total_active_ipv6
        FROM 
          countries
        WHERE 
          LOWER(country_name) = LOWER(?) OR 
          country_name_zh = ?
        LIMIT 1
      `, [query, query]);
      
      if (exactCountryResults.length > 0) {
        // 如果找到精确匹配的国家，直接返回
        logger.info(`国家名称精确匹配结果: ${exactCountryResults.length} 条`);
        results = exactCountryResults;
      } else {
        // 尝试精确匹配ASN名称
        const [exactAsnResults] = await db.query(`
          SELECT 
            'asn' as type, 
            asn, 
            as_name, 
            as_name_zh, 
            country_id, 
            total_active_ipv6
          FROM 
            asns
          WHERE 
            LOWER(as_name) = LOWER(?) OR 
            as_name_zh = ?
          LIMIT 1
        `, [query, query]);
        
        if (exactAsnResults.length > 0) {
          // 如果找到精确匹配的ASN，直接返回
          logger.info(`ASN名称精确匹配结果: ${exactAsnResults.length} 条`);
          results = exactAsnResults;
        } else {
          // 如果没有精确匹配，则进行模糊搜索，但优先国家
          const [fuzzyCountryResults] = await db.query(`
            SELECT 
              'country' as type, 
              country_id, 
              country_name, 
              country_name_zh, 
              total_active_ipv6
            FROM 
              countries
            WHERE 
              country_name LIKE ? OR 
              country_name_zh LIKE ?
            LIMIT 5
          `, [`%${query}%`, `%${query}%`]);
          
          if (fuzzyCountryResults.length > 0) {
            // 如果找到模糊匹配的国家，直接返回
            logger.info(`国家名称模糊匹配结果: ${fuzzyCountryResults.length} 条`);
            results = fuzzyCountryResults;
          } else {
            // 最后尝试模糊匹配ASN
            const [fuzzyAsnResults] = await db.query(`
              SELECT 
                'asn' as type, 
                asn, 
                as_name, 
                as_name_zh, 
                country_id, 
                total_active_ipv6
              FROM 
                asns
              WHERE 
                as_name LIKE ? OR 
                as_name_zh LIKE ?
              LIMIT 10
            `, [`%${query}%`, `%${query}%`]);
            
            logger.info(`ASN名称模糊匹配结果: ${fuzzyAsnResults.length} 条`);
            results = fuzzyAsnResults;
          }
        }
      }
    }
    else if (searchType === 'asn') {
      // ASN编号搜索 - 只搜索ASN表，精确匹配
      const [asnResults] = await db.query(`
        SELECT 
          'asn' as type, 
          asn, 
          as_name, 
          as_name_zh, 
          country_id, 
          total_active_ipv6
        FROM 
          asns
        WHERE 
          asn = ?
        LIMIT 1
      `, [parseInt(query)]);
      
      logger.info(`ASN编号搜索结果: ${asnResults.length} 条`);
      results = asnResults;
    }
    else if (searchType === 'prefix') {
      // 前缀搜索 - 只搜索前缀表
      const prefixValue = query.split('/')[0]; // 去掉可能的前缀长度部分
      
      // 先尝试精确匹配
      const [exactPrefixResults] = await db.query(`
        SELECT 
          'prefix' as type, 
          p.prefix_id, 
          p.prefix, 
          p.prefix_length, 
          p.asn, 
          p.country_id,
          (SELECT COUNT(*) FROM active_addresses WHERE prefix_id = p.prefix_id) as active_addresses_count
        FROM 
          ip_prefixes p
        WHERE 
          p.prefix = ?
        LIMIT 1
      `, [prefixValue]);
      
      if (exactPrefixResults.length > 0) {
        logger.info(`前缀精确匹配结果: ${exactPrefixResults.length} 条`);
        results = exactPrefixResults;
      } else {
        // 模糊匹配前缀
        const [fuzzyPrefixResults] = await db.query(`
          SELECT 
            'prefix' as type, 
            p.prefix_id, 
            p.prefix, 
            p.prefix_length, 
            p.asn, 
            p.country_id,
            (SELECT COUNT(*) FROM active_addresses WHERE prefix_id = p.prefix_id) as active_addresses_count
          FROM 
            ip_prefixes p
          WHERE 
            p.prefix LIKE ?
          LIMIT 10
        `, [`%${prefixValue}%`]);
        
        logger.info(`前缀模糊匹配结果: ${fuzzyPrefixResults.length} 条`);
        results = fuzzyPrefixResults;
      }
    }
    
    const endTime = performance.now();
    logger.info(`搜索完成，耗时: ${(endTime - startTime).toFixed(2)}ms, 找到 ${results.length} 条结果`);
    
    // 确保返回的数据格式正确，并添加更多信息
    return res.json({
      success: true,
      data: results || [],
      message: results.length > 0 ? `找到 ${results.length} 条结果` : `未找到与"${query}"相关的结果`,
      searchType: searchType,
      meta: {
        queryTime: (endTime - startTime).toFixed(2) + 'ms',
        searchedTables: getSearchedTables(searchType)
      }
    });
  } catch (error) {
    logger.error('搜索失败:', error);
    console.error('搜索详细错误:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: '搜索失败: ' + (error.message || '未知错误'),
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

/**
 * 获取搜索的表名
 */
function getSearchedTables(searchType) {
  const tables = [];
  
  if (searchType === 'country_code' || searchType === 'name') {
    tables.push('countries');
  }
  
  if (searchType === 'asn' || searchType === 'name') {
    tables.push('asns');
  }
  
  if (searchType === 'prefix') {
    tables.push('ip_prefixes');
  }
  
  return tables;
}

/**
 * 判断搜索类型
 */
function determineSearchType(query) {
  // 去除空格
  const trimmedQuery = query.trim();
  
  // 判断是否为ASN (纯数字)
  if (/^\d+$/.test(trimmedQuery)) {
    return 'asn';
  }
  
  // 判断是否为IPv6前缀
  if (trimmedQuery.includes(':')) {
    return 'prefix';
  }
  
  // 判断是否为国家代码 (2-3个字母)
  if (/^[a-zA-Z]{2,3}$/.test(trimmedQuery)) {
    return 'country_code';
  }
  
  // 其他情况视为名称搜索
  return 'name';
}


// ... 现有代码 ...

/**
 * 获取国家详细信息，包括ASN列表
 */
exports.getCountryDetail = async (req, res) => {
  try {
    const countryId = req.params.countryId;
    
    // 验证国家ID
    if (!countryId || countryId.length !== 2) {
      return res.status(400).json({
        success: false,
        message: '无效的国家ID'
      });
    }
    
    // 获取国家基本信息
    const [countryInfo] = await db.query(`
      SELECT 
        country_id, 
        country_name, 
        country_name_zh, 
        region, 
        subregion,
        total_ipv6_prefixes,
        total_active_ipv6,
        last_updated
      FROM countries
      WHERE country_id = ?
    `, [countryId]);
    
    if (countryInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到国家信息'
      });
    }
    
    // 获取国家的ASN列表
    const [asnList] = await db.query(`
      SELECT 
        a.asn, 
        a.as_name, 
        a.as_name_zh, 
        a.organization,
        a.total_ipv6_prefixes,
        a.total_active_ipv6,
        COUNT(DISTINCT ip.prefix_id) AS prefix_count
      FROM asns a
      LEFT JOIN ip_prefixes ip ON a.asn = ip.asn
      WHERE a.country_id = ?
      GROUP BY a.asn
      ORDER BY a.total_active_ipv6 DESC
    `, [countryId]);
    
    // 获取国家的IPv6统计数据
    const [ipv6Stats] = await db.query(`
      SELECT 
        COUNT(DISTINCT ip.prefix_id) AS total_prefixes,
        COUNT(DISTINCT a.asn) AS total_asns,
        SUM(CASE WHEN aa.iid_type IS NOT NULL THEN 1 ELSE 0 END) AS identified_iids,
        COUNT(DISTINCT aa.address_id) AS total_addresses
      FROM ip_prefixes ip
      LEFT JOIN asns a ON ip.asn = a.asn
      LEFT JOIN active_addresses aa ON ip.prefix_id = aa.prefix_id
      WHERE ip.country_id = ? AND ip.version = '6'
    `, [countryId]);
    
    // 获取IID类型分布
    const [iidDistribution] = await db.query(`
      SELECT 
        at.type_name,
        at.is_risky,
        COUNT(aa.address_id) AS address_count
      FROM active_addresses aa
      JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
      JOIN address_types at ON aa.iid_type = at.type_id
      WHERE ip.country_id = ?
      GROUP BY at.type_id
      ORDER BY address_count DESC
    `, [countryId]);
    
    res.json({
      success: true,
      data: {
        country: countryInfo[0],
        asns: asnList,
        stats: ipv6Stats[0],
        iidDistribution: iidDistribution
      }
    });
  } catch (error) {
    logger.error(`获取国家 ${req.params.countryId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: '获取国家详情失败'
    });
  }
};

/**
 * 获取ASN详细信息，包括前缀列表
 */
exports.getAsnDetail = async (req, res) => {
  try {
    const asn = parseInt(req.params.asn);
    
    // 验证ASN
    if (isNaN(asn)) {
      return res.status(400).json({
        success: false,
        message: '无效的ASN'
      });
    }
    
    // 获取ASN基本信息
    const [asnInfo] = await db.query(`
      SELECT 
        a.asn, 
        a.as_name, 
        a.as_name_zh, 
        a.organization,
        a.country_id,
        c.country_name,
        c.country_name_zh,
        a.total_ipv6_prefixes,
        a.total_active_ipv6
      FROM asns a
      LEFT JOIN countries c ON a.country_id = c.country_id
      WHERE a.asn = ?
    `, [asn]);
    
    if (asnInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到ASN信息'
      });
    }
    
    // 获取ASN的前缀列表
    const [prefixList] = await db.query(`
      SELECT 
        ip.prefix_id,
        ip.prefix,
        ip.prefix_length,
        ip.allocation_date,
        ip.registry,
        COUNT(aa.address_id) AS active_addresses
      FROM ip_prefixes ip
      LEFT JOIN active_addresses aa ON ip.prefix_id = aa.prefix_id
      WHERE ip.asn = ? AND ip.version = '6'
      GROUP BY ip.prefix_id
      ORDER BY active_addresses DESC
    `, [asn]);
    
    // 获取IID类型分布
    const [iidDistribution] = await db.query(`
      SELECT 
        at.type_name,
        at.is_risky,
        COUNT(aa.address_id) AS address_count
      FROM active_addresses aa
      JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
      JOIN address_types at ON aa.iid_type = at.type_id
      WHERE ip.asn = ?
      GROUP BY at.type_id
      ORDER BY address_count DESC
    `, [asn]);
    
    res.json({
      success: true,
      data: {
        asn: asnInfo[0],
        prefixes: prefixList,
        iidDistribution: iidDistribution
      }
    });
  } catch (error) {
    logger.error(`获取ASN ${req.params.asn} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: '获取ASN详情失败'
    });
  }
};


/**
 * 获取全球IPv6统计排名
 */
exports.getGlobalStats = async (req, res) => {
  try {
    const { sort = 'total_active_ipv6', order = 'desc', limit = 500 } = req.query;
    
    // 验证排序字段
    const allowedSortFields = ['total_active_ipv6', 'total_ipv6_prefixes', 'country_name'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'total_active_ipv6';
    
    // 验证排序方向
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // 获取国家排名
    const [countries] = await db.query(`
      SELECT 
        c.country_id, 
        c.country_name, 
        c.country_name_zh, 
        c.region, 
        c.subregion,
        c.total_ipv6_prefixes,
        c.total_active_ipv6,
        COUNT(DISTINCT a.asn) AS asn_count
      FROM countries c
      LEFT JOIN asns a ON c.country_id = a.country_id
      GROUP BY c.country_id
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ?
    `, [parseInt(limit)]);
    
    // 获取全球统计数据
    const [globalStats] = await db.query(`
      SELECT 
        COUNT(DISTINCT c.country_id) AS total_countries,
        COUNT(DISTINCT a.asn) AS total_asns,
        COUNT(DISTINCT ip.prefix_id) AS total_prefixes,
        COUNT(DISTINCT aa.address_id) AS total_addresses
      FROM countries c
      LEFT JOIN asns a ON c.country_id = a.country_id
      LEFT JOIN ip_prefixes ip ON a.asn = ip.asn
      LEFT JOIN active_addresses aa ON ip.prefix_id = aa.prefix_id
      WHERE ip.version = '6'
    `);
    
    // 获取全球IID类型分布
    const [iidDistribution] = await db.query(`
      SELECT 
        at.type_name,
        at.is_risky,
        COUNT(aa.address_id) AS address_count
      FROM active_addresses aa
      JOIN address_types at ON aa.iid_type = at.type_id
      GROUP BY at.type_id
      ORDER BY address_count DESC
    `);
    
    // 获取区域分布
    const [regionDistribution] = await db.query(`
      SELECT 
        c.region,
        COUNT(DISTINCT c.country_id) AS country_count,
        SUM(c.total_active_ipv6) AS address_count
      FROM countries c
      WHERE c.region IS NOT NULL
      GROUP BY c.region
      ORDER BY address_count DESC
    `);
    
    res.json({
      success: true,
      data: {
        countries: countries,
        stats: globalStats[0],
        iidDistribution: iidDistribution,
        regionDistribution: regionDistribution
      }
    });
  } catch (error) {
    logger.error('获取全球IPv6统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取全球IPv6统计失败'
    });
  }
};