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
    
    // 获取国家的IPv6统计数据，直接使用ASN表格数据
    const [ipv6Stats] = await db.query(`
      SELECT 
        COUNT(DISTINCT ip.prefix_id) AS total_prefixes,
        COUNT(DISTINCT a.asn) AS total_asns,
        SUM(a.total_active_ipv6) AS total_addresses
      FROM ip_prefixes ip
      LEFT JOIN asns a ON ip.asn = a.asn
      WHERE ip.country_id = ? AND ip.version = '6'
    `, [countryId]);
    
    res.json({
      success: true,
      data: {
        country: countryInfo[0],
        asns: asnList,
        stats: ipv6Stats[0]
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
    
    // 获取ASN的前缀列表，直接使用ip_prefixes表中的active_ipv6_count字段
    const [prefixList] = await db.query(`
      SELECT 
        ip.prefix_id,
        ip.prefix,
        ip.prefix_length,
        ip.allocation_date,
        ip.registry,
        ip.active_ipv6_count AS active_addresses
      FROM ip_prefixes ip
      WHERE ip.asn = ? AND ip.version = '6'
      ORDER BY ip.active_ipv6_count DESC
    `, [asn]);
    
    // 获取IID类型分布（如果仍需要此信息，可以保留，但不再使用活跃地址表）
    // 由于不再使用活跃地址表，此处可以移除或修改为其他统计信息
    // 以下是一个示例，如果您有其他数据源可以替换
    const iidDistribution = [];
    
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
    console.log('开始执行getGlobalStats函数...');
    const startTime = performance.now();
    
    const { sort = 'total_active_ipv6', order = 'desc', limit = 500 } = req.query;
    console.log(`请求参数: sort=${sort}, order=${order}, limit=${limit}`);
    
    // 验证排序字段
    const allowedSortFields = ['total_active_ipv6', 'total_ipv6_prefixes', 'country_name'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'total_active_ipv6';
    
    // 验证排序方向
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    console.log('开始查询国家排名...');
    const countryQueryStart = performance.now();
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
    console.log(`国家排名查询完成，耗时: ${(performance.now() - countryQueryStart).toFixed(2)}ms, 返回${countries.length}条记录`);
    
    console.log('开始查询全球统计数据...');
    const statsQueryStart = performance.now();
    // 优化全球统计数据查询 - 直接从countries和asns表获取汇总数据
    const [globalStats] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM countries) AS total_countries,
        (SELECT COUNT(*) FROM asns) AS total_asns,
        (SELECT SUM(total_ipv6_prefixes) FROM countries) AS total_prefixes,
        (SELECT SUM(total_active_ipv6) FROM countries) AS total_addresses
    `);
    console.log(`全球统计数据查询完成，耗时: ${(performance.now() - statsQueryStart).toFixed(2)}ms`);
    
    // 获取区域分布
    console.log('开始查询区域分布...');
    const regionQueryStart = performance.now();
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
    console.log(`区域分布查询完成，耗时: ${(performance.now() - regionQueryStart).toFixed(2)}ms, 返回${regionDistribution.length}条记录`);
    
    const totalTime = performance.now() - startTime;
    console.log(`getGlobalStats函数执行完成，总耗时: ${totalTime.toFixed(2)}ms`);
    
    res.json({
      success: true,
      data: {
        countries: countries,
        stats: globalStats[0],
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

/**
 * 获取所有协议列表
 */
exports.getProtocols = async (req, res) => {
  try {
    const [protocols] = await db.query(`
      SELECT 
        protocol_id,
        protocol_name,
        description,
        affected_addresses,
        affected_asns,
        affected_countries
      FROM 
        protocol_stats_view
      ORDER BY 
        affected_addresses DESC
    `);
    
    res.json({
      success: true,
      data: protocols
    });
  } catch (error) {
    logger.error('获取协议列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取协议列表失败'
    });
  }
};

/**
* 获取协议详情
*/
exports.getProtocolDetail = async (req, res) => {
  try {
    const { protocolId } = req.params;
    
    // 获取协议详情
    const [[protocol]] = await db.query(`
      SELECT 
        psv.protocol_id,
        psv.protocol_name,
        p.description, -- description from protocols table
        psv.affected_addresses,
        psv.affected_asns,
        psv.affected_countries,
        (SELECT SUM(total_active_ipv6) FROM countries) AS total_addresses, -- Proxy for total addresses
        CAST((psv.affected_addresses / (SELECT SUM(total_active_ipv6) FROM countries) * 100) AS DECIMAL(10,2)) AS affected_percentage
      FROM 
        protocol_stats_view psv
      JOIN
        protocols p ON psv.protocol_id = p.protocol_id
      WHERE 
        psv.protocol_id = ?
    `, [protocolId]);
    
    if (!protocol) {
      return res.status(404).json({
        success: false,
        message: `协议 ${protocolId} 不存在`
      });
    }
    
    res.json({
      success: true,
      data: protocol
    });
  } catch (error) {
    logger.error(`获取协议 ${req.params.protocolId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取协议详情失败: ${error.message}`
    });
  }
};

  
/**
 * 获取协议的ASN列表
 */
exports.getProtocolAsns = async (req, res) => {
  try {
    const { protocolId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    logger.info(`获取协议 ${protocolId} 的ASN列表`);
    
    const [asns] = await db.query(`
      SELECT 
        asn,
        as_name,
        as_name_zh,
        country_id,
        country_name,
        country_name_zh,
        affected_addresses,
        total_active_ipv6,
        affected_percentage
      FROM 
        asn_protocol_stats_view
      WHERE 
        protocol_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [protocolId, parseInt(limit), parseInt(offset)]);
    
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM asn_protocol_stats_view 
      WHERE protocol_id = ?
    `, [protocolId]);
    
    res.json({
      success: true,
      data: {
        asns: asns,
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error(`获取协议 ${req.params.protocolId} 的ASN列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取协议ASN列表失败: ${error.message}`
    });
  }
};

/**
 * 获取协议的区域列表
 */
exports.getProtocolRegions = async (req, res) => {
  try {
    const { protocolId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const [regions] = await db.query(`
      SELECT 
        region,
        protocol_name,
        affected_addresses,
        total_addresses,
        affected_percentage
      FROM 
        region_protocol_stats_view
      WHERE 
        protocol_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [protocolId, parseInt(limit), parseInt(offset)]);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(DISTINCT region) as total 
      FROM region_protocol_stats_view 
      WHERE protocol_id = ?
    `, [protocolId]);
    
    // 修改这里：直接返回regions数组，而不是包装在对象中
    res.json({
      success: true,
      data: regions
    });
  } catch (error) {
    logger.error(`获取协议 ${req.params.protocolId} 的区域列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取协议区域列表失败: ${error.message}`
    });
  }
};

/**
 * 获取ASN的协议详情
 */
exports.getAsnProtocolDetail = async (req, res) => {
  try {
    const { asn, protocolId } = req.params;
    
    const [[detail]] = await db.query(`
      SELECT 
        apsv.asn,
        apsv.as_name,
        apsv.as_name_zh,
        apsv.country_id,
        apsv.country_name,
        apsv.country_name_zh,
        apsv.protocol_id,
        apsv.protocol_name,
        p.description AS protocol_description,
        apsv.affected_addresses,
        apsv.total_active_ipv6,
        CAST(apsv.affected_percentage AS DECIMAL(10,2)) AS affected_percentage
      FROM 
        asn_protocol_stats_view apsv
      JOIN
        protocols p ON apsv.protocol_id = p.protocol_id
      WHERE 
        apsv.asn = ? AND apsv.protocol_id = ?
    `, [asn, protocolId]);
    
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: `ASN ${asn} 的协议 ${protocolId} 详情不存在`
      });
    }
    
    // 确保affected_percentage是数字类型
    if (detail.affected_percentage !== null && detail.affected_percentage !== undefined) {
      detail.affected_percentage = parseFloat(detail.affected_percentage);
    } else {
      detail.affected_percentage = 0;
    }
    
    // 获取ASN的前缀列表
    const [prefixes] = await db.query(`
      SELECT 
        prefix, 
        prefix_length, 
        active_ipv6_count as total_addresses
      FROM 
        ip_prefixes
      WHERE 
        asn = ?
    `, [asn]);
    
    // 根据前缀数量和ASN总体受影响比例计算每个前缀的受影响地址数
    const prefixDistribution = prefixes.map(prefix => {
      // 按照前缀所占比例分配受影响地址
      const ratio = prefix.total_addresses / detail.total_active_ipv6;
      const affected_addresses = Math.round(detail.affected_addresses * ratio);
      const affected_percentage = prefix.total_addresses > 0 
        ? (affected_addresses / prefix.total_addresses) * 100 
        : 0;
        
      return {
        prefix: prefix.prefix,
        prefix_length: prefix.prefix_length,
        total_addresses: prefix.total_addresses,
        affected_addresses: affected_addresses,
        affected_percentage: parseFloat(affected_percentage.toFixed(2))
      };
    });
    
    // 构建响应数据结构
    const responseData = {
      info: detail,
      prefixDistribution: prefixDistribution
    };
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    logger.error(`获取ASN ${req.params.asn} 的协议 ${req.params.protocolId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取ASN协议详情失败: ${error.message}`
    });
  }
};

/**
 * 获取协议的国家列表
 */
exports.getProtocolCountries = async (req, res) => {
  try {
    const { protocolId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    logger.info(`获取协议 ${protocolId} 的国家列表`);
    
    const [countries] = await db.query(`
      SELECT 
        country_id,
        country_name,
        country_name_zh,
        affected_addresses,
        total_addresses,
        percentage as affected_percentage
      FROM 
        country_protocol_stats_view
      WHERE 
        protocol_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [protocolId, parseInt(limit), parseInt(offset)]);
    
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM country_protocol_stats_view 
      WHERE protocol_id = ?
    `, [protocolId]);
    
    res.json({
      success: true,
      data: {
        countries: countries,
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error(`获取协议 ${req.params.protocolId} 的国家列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取协议国家列表失败: ${error.message}`
    });
  }
};

/**
 * 获取国家的协议详情
 */
exports.getCountryProtocolDetail = async (req, res) => {
  try {
    const { countryId, protocolId } = req.params;
    
    const [[detail]] = await db.query(`
      SELECT 
        cpsv.country_id,
        cpsv.country_name,
        cpsv.country_name_zh,
        cpsv.protocol_id,
        cpsv.protocol_name,
        p.description AS protocol_description,
        cpsv.affected_addresses,
        c.total_active_ipv6 as total_addresses,
        cpsv.percentage as affected_percentage,
        c.region
      FROM 
        country_protocol_stats_view cpsv
      JOIN
        protocols p ON cpsv.protocol_id = p.protocol_id
      JOIN
        countries c ON cpsv.country_id = c.country_id
      WHERE 
        cpsv.country_id = ? AND cpsv.protocol_id = ?
    `, [countryId, protocolId]);
    
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: `国家 ${countryId} 的协议 ${protocolId} 详情不存在`
      });
    }
    
    // 获取该国家下受该协议影响的ASN列表
    const [asnDistribution] = await db.query(`
      SELECT 
        asn,
        as_name,
        as_name_zh,
        affected_addresses,
        total_active_ipv6,
        affected_percentage
      FROM 
        asn_protocol_stats_view
      WHERE 
        country_id = ? AND protocol_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT 10
    `, [countryId, protocolId]);
    
    // 构建前端期望的响应格式
    const response = {
      info: detail,
      asnDistribution: asnDistribution || []
    };
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`获取国家 ${req.params.countryId} 的协议 ${req.params.protocolId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取国家协议详情失败: ${error.message}`
    });
  }
};



/**
 * 获取所有漏洞列表
 */
exports.getVulnerabilities = async (req, res) => {
  try {
    const [vulnerabilities] = await db.query(`
      SELECT 
        vulnerability_id,
        cve_id,
        name,
        description,
        severity,
        affected_addresses,
        affected_asns,
        affected_countries
      FROM 
        vulnerability_stats_view
      ORDER BY 
        affected_addresses DESC
    `);
    
    res.json({
      success: true,
      data: vulnerabilities
    });
  } catch (error) {
    logger.error('获取漏洞列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取漏洞列表失败'
    });
  }
};

/**
 * 获取漏洞详情
 */
exports.getVulnerabilityDetail = async (req, res) => {
  try {
    const { vulnerabilityId } = req.params;
    
    // 获取漏洞详情
    const [[vulnerability]] = await db.query(`
      SELECT 
        vsv.vulnerability_id,
        vsv.cve_id,
        vsv.name,
        vsv.description,
        vsv.severity,
        vsv.affected_addresses,
        vsv.affected_asns,
        vsv.affected_countries,
        (SELECT SUM(total_active_ipv6) FROM countries) AS total_addresses,
        CAST((vsv.affected_addresses / (SELECT SUM(total_active_ipv6) FROM countries) * 100) AS DECIMAL(10,2)) AS affected_percentage
      FROM 
        vulnerability_stats_view vsv
      WHERE 
        vsv.vulnerability_id = ?
    `, [vulnerabilityId]);
    
    if (!vulnerability) {
      return res.status(404).json({
        success: false,
        message: `漏洞 ${vulnerabilityId} 不存在`
      });
    }
    
    res.json({
      success: true,
      data: vulnerability
    });
  } catch (error) {
    logger.error(`获取漏洞 ${req.params.vulnerabilityId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取漏洞详情失败: ${error.message}`
    });
  }
};

/**
 * 获取漏洞的ASN列表
 */
exports.getVulnerabilityAsns = async (req, res) => {
  try {
    const { vulnerabilityId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    logger.info(`获取漏洞 ${vulnerabilityId} 的ASN列表`);
    
    const [asns] = await db.query(`
      SELECT 
        asn,
        as_name,
        as_name_zh,
        country_id,
        country_name,
        country_name_zh,
        affected_addresses,
        total_active_ipv6,
        affected_percentage
      FROM 
        asn_vulnerability_stats_view
      WHERE 
        vulnerability_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [vulnerabilityId, parseInt(limit), parseInt(offset)]);
    
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM asn_vulnerability_stats_view 
      WHERE vulnerability_id = ?
    `, [vulnerabilityId]);
    
    res.json({
      success: true,
      data: {
        asns: asns,
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的ASN列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取漏洞ASN列表失败: ${error.message}`
    });
  }
};

/**
 * 获取漏洞的区域列表
 */
exports.getVulnerabilityRegions = async (req, res) => {
  try {
    const { vulnerabilityId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const [regions] = await db.query(`
      SELECT 
        region,
        affected_addresses,
        total_addresses,
        affected_percentage
      FROM 
        region_vulnerability_stats_view
      WHERE 
        vulnerability_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [vulnerabilityId, parseInt(limit), parseInt(offset)]);

    const [[{ total }]] = await db.query(`
      SELECT COUNT(DISTINCT region) as total 
      FROM region_vulnerability_stats_view 
      WHERE vulnerability_id = ?
    `, [vulnerabilityId]);

    res.json({
      success: true,
      data: {
        regions: regions,
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的区域列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取漏洞区域列表失败: ${error.message}`
    });
  }
};

/**
 * 获取ASN的漏洞详情
 */
exports.getAsnVulnerabilityDetail = async (req, res) => {
  try {
    const { asn, vulnerabilityId } = req.params;
    
    const [[detail]] = await db.query(`
      SELECT 
        avsv.asn,
        avsv.as_name,
        avsv.as_name_zh,
        avsv.country_id,
        avsv.country_name,
        avsv.country_name_zh,
        avsv.vulnerability_id,
        avsv.cve_id,
        avsv.name,
        avsv.severity,
        v.description,
        avsv.affected_addresses,
        avsv.total_active_ipv6,
        avsv.affected_percentage
      FROM 
        asn_vulnerability_stats_view avsv
      JOIN
        vulnerabilities v ON avsv.vulnerability_id = v.vulnerability_id
      WHERE 
        avsv.asn = ? AND avsv.vulnerability_id = ?
    `, [asn, vulnerabilityId]);
    
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: `ASN ${asn} 的漏洞 ${vulnerabilityId} 详情不存在`
      });
    }
    
    res.json({
      success: true,
      data: detail
    });
  } catch (error) {
    logger.error(`获取ASN ${req.params.asn} 的漏洞 ${req.params.vulnerabilityId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取ASN漏洞详情失败: ${error.message}`
    });
  }
};

/**
 * 获取漏洞的国家列表
 */
exports.getVulnerabilityCountries = async (req, res) => {
  try {
    const { vulnerabilityId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    logger.info(`获取漏洞 ${vulnerabilityId} 的国家列表`);
    
    const [countries] = await db.query(`
      SELECT 
        country_id,
        country_name,
        country_name_zh,
        address_count as affected_addresses,
        percentage as affected_percentage
      FROM 
        country_vulnerability_stats_view
      WHERE 
        vulnerability_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT ? OFFSET ?
    `, [vulnerabilityId, parseInt(limit), parseInt(offset)]);
    
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) as total 
      FROM country_vulnerability_stats_view 
      WHERE vulnerability_id = ?
    `, [vulnerabilityId]);
    
    res.json({
      success: true,
      data: {
        countries: countries,
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的国家列表失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取漏洞国家列表失败: ${error.message}`
    });
  }
};

/**
 * 获取国家的漏洞详情
 */
exports.getCountryVulnerabilityDetail = async (req, res) => {
  try {
    const { countryId, vulnerabilityId } = req.params;
    
    const [[detail]] = await db.query(`
      SELECT 
        cvsv.country_id,
        cvsv.country_name,
        cvsv.country_name_zh,
        cvsv.vulnerability_id,
        cvsv.cve_id,
        cvsv.name,
        cvsv.severity,
        v.description,
        cvsv.address_count as affected_addresses,
        c.total_active_ipv6 as total_addresses,
        cvsv.percentage as affected_percentage
      FROM 
        country_vulnerability_stats_view cvsv
      JOIN
        vulnerabilities v ON cvsv.vulnerability_id = v.vulnerability_id
      JOIN
        countries c ON cvsv.country_id = c.country_id
      WHERE 
        cvsv.country_id = ? AND cvsv.vulnerability_id = ?
    `, [countryId, vulnerabilityId]);
    
    if (!detail) {
      return res.status(404).json({
        success: false,
        message: `国家 ${countryId} 的漏洞 ${vulnerabilityId} 详情不存在`
      });
    }
    
    // 获取该国家下受该漏洞影响的ASN列表
    const [asns] = await db.query(`
      SELECT 
        asn,
        as_name,
        as_name_zh,
        affected_addresses,
        total_active_ipv6,
        affected_percentage
      FROM 
        asn_vulnerability_stats_view
      WHERE 
        country_id = ? AND vulnerability_id = ?
      ORDER BY 
        affected_addresses DESC
      LIMIT 10
    `, [countryId, vulnerabilityId]);
    
    detail.asns = asns;
    
    res.json({
      success: true,
      data: detail
    });
  } catch (error) {
    logger.error(`获取国家 ${req.params.countryId} 的漏洞 ${req.params.vulnerabilityId} 详情失败:`, error);
    res.status(500).json({
      success: false,
      message: `获取国家漏洞详情失败: ${error.message}`
    });
  }
};
