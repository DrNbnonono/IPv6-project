// ... existing code ...
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
          apsv.affected_percentage
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
      
      res.json({
        success: true,
        data: detail
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
          address_count as affected_addresses,
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
          cpsv.address_count as affected_addresses,
          c.total_active_ipv6 as total_addresses,
          cpsv.percentage as affected_percentage
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
      const [asns] = await db.query(`
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
      
      detail.asns = asns;
      
      res.json({
        success: true,
        data: detail
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

  /**
 * 获取所有协议列表
 */
exports.getProtocols = async (req, res) => {
    try {
      const [protocols] = await db.query(`
        SELECT 
          p.protocol_id,
          p.protocol_name,
          p.description,
          ps.affected_addresses,
          ps.affected_asns,
          ps.affected_countries
        FROM 
          protocols p
        JOIN 
          protocol_stats ps ON p.protocol_id = ps.protocol_id
        ORDER BY 
          ps.affected_addresses DESC
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
          p.protocol_id,
          p.protocol_name,
          p.description,
          ps.affected_addresses,
          ps.affected_asns,
          ps.affected_countries,
          (SELECT COUNT(*) FROM active_addresses) AS total_addresses,
          CAST((ps.affected_addresses / (SELECT COUNT(*) FROM active_addresses) * 100) AS DECIMAL(10,2)) AS affected_percentage
        FROM 
          protocols p
        JOIN 
          protocol_stats ps ON p.protocol_id = ps.protocol_id
        WHERE 
          p.protocol_id = ?
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
      
      // 查询协议ASN列表，正确连接asns和countries表获取名称信息
      const [asns] = await db.query(`
        SELECT 
          aps.asn,
          a.as_name,
          a.as_name_zh,
          a.country_id,
          c.country_name,
          c.country_name_zh,
          aps.address_count as affected_addresses,
          a.total_active_ipv6,
          ROUND((aps.address_count / a.total_active_ipv6) * 100, 2) as affected_percentage
        FROM 
          asn_protocol_stats aps
        JOIN 
          asns a ON aps.asn = a.asn
        JOIN 
          countries c ON a.country_id = c.country_id
        WHERE 
          aps.protocol_id = ?
        ORDER BY 
          aps.address_count DESC
        LIMIT ? OFFSET ?
      `, [protocolId, parseInt(limit), parseInt(offset)]);
      
      // 获取总数
      const [[{ total }]] = await db.query(`
        SELECT COUNT(*) as total 
        FROM asn_protocol_stats 
        WHERE protocol_id = ?
      `, [protocolId]);
      
      // 修改返回的数据结构，使其与前端期望的一致
      res.json({
        success: true,
        data: {
          asns: asns,
          total: total
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
   * 获取协议在各地区的影响
   */
  exports.getProtocolRegions = async (req, res) => {
    try {
      const protocolId = parseInt(req.params.protocolId);
      
      if (isNaN(protocolId)) {
        return res.status(400).json({
          success: false,
          message: '无效的协议ID'
        });
      }
      
      // 修改查询，确保百分比是基于最新的地区活跃地址总数计算的
      const [regionList] = await db.query(`
        SELECT 
          c.region,
          COUNT(DISTINCT ap.address_id) AS affected_addresses,
          (
              SELECT COUNT(DISTINCT aa2.address_id)
              FROM active_addresses aa2
              JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
              JOIN countries c2 ON ip2.country_id = c2.country_id
              WHERE c2.region = c.region
          ) AS total_addresses,
          ROUND(
              COUNT(DISTINCT ap.address_id) * 100.0 / 
              (
                  SELECT COUNT(DISTINCT aa2.address_id)
                  FROM active_addresses aa2
                  JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
                  JOIN countries c2 ON ip2.country_id = c2.country_id
                  WHERE c2.region = c.region
              ), 
              2
          ) AS affected_percentage
      FROM 
          countries c
      JOIN 
          ip_prefixes ip ON c.country_id = ip.country_id
      JOIN 
          active_addresses aa ON ip.prefix_id = aa.prefix_id
      JOIN 
          address_protocols ap ON aa.address_id = ap.address_id
      WHERE 
          ap.protocol_id = ?
      GROUP BY 
          c.region
      ORDER BY 
          affected_addresses DESC;
      `, [protocolId]);
      
      res.json({
        success: true,
        data: regionList
      });
    } catch (error) {
      logger.error(`获取协议 ${req.params.protocolId} 的地区分布失败:`, error);
      res.status(500).json({
        success: false,
        message: '获取协议地区分布失败'
      });
    }
  };
  
  /**
   * 获取ASN中特定协议的详细信息
   */
  exports.getAsnProtocolDetail = async (req, res) => {
    try {
      const asn = parseInt(req.params.asn);
      const protocolId = parseInt(req.params.protocolId);
      
      if (isNaN(asn) || isNaN(protocolId)) {
        return res.status(400).json({
          success: false,
          message: '无效的ASN或协议ID'
        });
      }
      
      // 获取ASN中协议的基本信息
      const [protocolInfo] = await db.query(`
        SELECT 
          aps.asn,
          a.as_name,
          a.as_name_zh,
          a.country_id,
          c.country_name,
          c.country_name_zh,
          aps.protocol_id,
          p.protocol_name,
          aps.address_count AS affected_addresses,
          a.total_active_ipv6,
          ROUND((aps.address_count / a.total_active_ipv6) * 100, 2) AS affected_percentage
        FROM 
          asn_protocol_stats aps
        JOIN
          asns a ON aps.asn = a.asn
        JOIN
          countries c ON a.country_id = c.country_id
        JOIN
          protocols p ON aps.protocol_id = p.protocol_id
        WHERE 
          aps.asn = ? AND aps.protocol_id = ?
      `, [asn, protocolId]);
      
      if (protocolInfo.length === 0) {
        return res.status(404).json({
          success: false,
          message: '未找到ASN的协议信息'
        });
      }
      
      // 获取ASN中协议的前缀分布
      const [prefixDistribution] = await db.query(`
        SELECT 
          ip.prefix,
          ip.prefix_length,
          COUNT(DISTINCT ap.address_id) AS affected_addresses,
          (SELECT COUNT(*) FROM active_addresses aa WHERE aa.prefix_id = ip.prefix_id) AS total_addresses,
          CAST((COUNT(DISTINCT ap.address_id) / (SELECT COUNT(*) FROM active_addresses aa WHERE aa.prefix_id = ip.prefix_id) * 100) AS DECIMAL(10,2)) AS affected_percentage
        FROM 
          ip_prefixes ip
        JOIN 
          active_addresses aa ON ip.prefix_id = aa.prefix_id
        JOIN 
          address_protocols ap ON aa.address_id = ap.address_id
        WHERE 
          ip.asn = ? AND ap.protocol_id = ?
        GROUP BY 
          ip.prefix_id
        ORDER BY 
          affected_addresses DESC
        LIMIT 20
      `, [asn, protocolId]);
      
      res.json({
        success: true,
        data: {
          info: protocolInfo[0],
          prefixDistribution: prefixDistribution
        }
      });
    } catch (error) {
      logger.error(`获取ASN ${req.params.asn} 的协议 ${req.params.protocolId} 详情失败:`, error);
      res.status(500).json({
        success: false,
        message: '获取ASN协议详情失败'
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
      
      // 查询协议国家列表
      const [countries] = await db.query(`
        SELECT 
          c.country_id,
          c.country_name,
          c.country_name_zh,
          c.region,
          COUNT(DISTINCT ap.address_id) AS affected_addresses,
          (
            SELECT COUNT(DISTINCT aa2.address_id)
            FROM active_addresses aa2
            JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
            WHERE ip2.country_id = c.country_id
          ) AS total_active_ipv6,
          ROUND(
            COUNT(DISTINCT ap.address_id) * 100.0 / 
            (
              SELECT COUNT(DISTINCT aa2.address_id)
              FROM active_addresses aa2
              JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
              WHERE ip2.country_id = c.country_id
            ), 
            2
          ) AS affected_percentage
        FROM 
          countries c
        JOIN 
          ip_prefixes ip ON c.country_id = ip.country_id
        JOIN 
          active_addresses aa ON ip.prefix_id = aa.prefix_id
        JOIN 
          address_protocols ap ON aa.address_id = ap.address_id
        WHERE 
          ap.protocol_id = ?
        GROUP BY 
          c.country_id
        ORDER BY 
          affected_addresses DESC
        LIMIT ? OFFSET ?
      `, [protocolId, parseInt(limit), parseInt(offset)]);
      
      // 获取总数
      const [[{ total }]] = await db.query(`
        SELECT COUNT(DISTINCT c.country_id) as total 
        FROM countries c
        JOIN ip_prefixes ip ON c.country_id = ip.country_id
        JOIN active_addresses aa ON ip.prefix_id = aa.prefix_id
        JOIN address_protocols ap ON aa.address_id = ap.address_id
        WHERE ap.protocol_id = ?
      `, [protocolId]);
      
      res.json({
        success: true,
        data: {
          countries: countries,
          total: total
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
   * 获取国家中特定协议的详细信息
   */
  exports.getCountryProtocolDetail = async (req, res) => {
    try {
      const countryId = req.params.countryId;
      const protocolId = parseInt(req.params.protocolId);
      
      if (!countryId || isNaN(protocolId)) {
        return res.status(400).json({
          success: false,
          message: '无效的国家ID或协议ID'
        });
      }
      
      // 获取国家中协议的基本信息
      const [[protocolInfo]] = await db.query(`
        SELECT 
          c.country_id,
          c.country_name,
          c.country_name_zh,
          c.region,
          p.protocol_id,
          p.protocol_name,
          COUNT(DISTINCT ap.address_id) AS affected_addresses,
          (
            SELECT COUNT(DISTINCT aa2.address_id)
            FROM active_addresses aa2
            JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
            WHERE ip2.country_id = c.country_id
          ) AS total_active_ipv6,
          ROUND(
            COUNT(DISTINCT ap.address_id) * 100.0 / 
            (
              SELECT COUNT(DISTINCT aa2.address_id)
              FROM active_addresses aa2
              JOIN ip_prefixes ip2 ON aa2.prefix_id = ip2.prefix_id
              WHERE ip2.country_id = c.country_id
            ), 
            2
          ) AS affected_percentage
        FROM 
          countries c
        JOIN 
          ip_prefixes ip ON c.country_id = ip.country_id
        JOIN 
          active_addresses aa ON ip.prefix_id = aa.prefix_id
        JOIN 
          address_protocols ap ON aa.address_id = ap.address_id
        JOIN
          protocols p ON ap.protocol_id = p.protocol_id
        WHERE 
          c.country_id = ? AND ap.protocol_id = ?
        GROUP BY 
          c.country_id, p.protocol_id
      `, [countryId, protocolId]);
      
      if (!protocolInfo) {
        return res.status(404).json({
          success: false,
          message: `未找到国家 ${countryId} 的协议 ${protocolId} 数据`
        });
      }
      
      // 获取该国家下受该协议影响的ASN列表
      const [asnDistribution] = await db.query(`
        SELECT 
          a.asn,
          a.as_name,
          a.as_name_zh,
          COUNT(DISTINCT ap.address_id) AS affected_addresses,
          a.total_active_ipv6,
          ROUND(
            COUNT(DISTINCT ap.address_id) * 100.0 / a.total_active_ipv6, 
            2
          ) AS affected_percentage
        FROM 
          asns a
        JOIN 
          ip_prefixes ip ON a.asn = ip.asn
        JOIN 
          active_addresses aa ON ip.prefix_id = aa.prefix_id
        JOIN 
          address_protocols ap ON aa.address_id = ap.address_id
        WHERE 
          ip.country_id = ? AND ap.protocol_id = ?
        GROUP BY 
          a.asn
        ORDER BY 
          affected_addresses DESC
        LIMIT 20
      `, [countryId, protocolId]);
      
      res.json({
        success: true,
        data: {
          info: protocolInfo,
          asnDistribution: asnDistribution
        }
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
          v.vulnerability_id,
          v.cve_id,
          v.name AS title,
          v.severity,
          vs.affected_addresses,
          vs.affected_asns,
          vs.affected_countries
        FROM 
          vulnerabilities v
        JOIN 
          vulnerability_stats vs ON v.vulnerability_id = vs.vulnerability_id
        ORDER BY 
          vs.affected_addresses DESC
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
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      
      // 增强错误处理
      if (req.params.vulnerabilityId === undefined || req.params.vulnerabilityId === 'undefined') {
        logger.error(`获取漏洞详情失败: 漏洞ID为undefined`);
        return res.status(400).json({
          success: false,
          message: '无效的漏洞ID: 漏洞ID为undefined，请确保正确传递漏洞ID参数'
        });
      }
      
      if (isNaN(vulnerabilityId)) {
        logger.error(`获取漏洞 ${req.params.vulnerabilityId} 详情失败: 无效的漏洞ID格式`);
        return res.status(400).json({
          success: false,
          message: `无效的漏洞ID格式: ${req.params.vulnerabilityId}，请确保传递有效的数字ID`
        });
      }
      
      // 获取漏洞详情
      const [[vulnerability]] = await db.query(`
        SELECT 
          v.vulnerability_id,
          v.cve_id,
          v.name,
          v.description,
          v.severity,
          v.affected_protocols,
          vs.affected_addresses,
          vs.affected_asns,
          vs.affected_countries,
          (SELECT COUNT(*) FROM active_addresses) AS total_addresses,
          CAST((vs.affected_addresses / (SELECT COUNT(*) FROM active_addresses) * 100) AS DECIMAL(10,2)) AS affected_percentage
        FROM 
          vulnerabilities v
        JOIN 
          vulnerability_stats vs ON v.vulnerability_id = vs.vulnerability_id
        WHERE 
          v.vulnerability_id = ?
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
      logger.error(`获取漏洞 ${req.params.vulnerabilityId} 详情失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取漏洞详情失败: ${error.message}`
      });
    }
  };
  
  
  
  /**
   * 获取漏洞影响的ASN列表
   */
  exports.getVulnerabilityAsns = async (req, res) => {
    try {
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      const { limit = 50, offset = 0 } = req.query;
      
      // 增强错误处理，提供更详细的错误信息
      if (req.params.vulnerabilityId === undefined || req.params.vulnerabilityId === 'undefined') {
        logger.error(`获取漏洞ASN列表失败: 漏洞ID为undefined`);
        return res.status(400).json({
          success: false,
          message: '无效的漏洞ID: 漏洞ID为undefined，请确保正确传递漏洞ID参数'
        });
      }
      
      if (isNaN(vulnerabilityId)) {
        logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的ASN列表失败: 无效的漏洞ID格式`);
        return res.status(400).json({
          success: false,
          message: `无效的漏洞ID格式: ${req.params.vulnerabilityId}，请确保传递有效的数字ID`
        });
      }
      
      const [asnList] = await db.query(`
        SELECT 
          avs.asn,
          avs.as_name,
          avs.as_name_zh,
          avs.country_id,
          avs.country_name,
          avs.country_name_zh,
          avs.affected_addresses,
          avs.total_active_ipv6,
          avs.affected_percentage
        FROM 
          asn_vulnerability_stats avs
        WHERE 
          avs.vulnerability_id = ?
        ORDER BY 
          avs.affected_addresses DESC
        LIMIT ? OFFSET ?
      `, [vulnerabilityId, parseInt(limit), parseInt(offset)]);
      
      // 获取总数
      const [countResult] = await db.query(`
        SELECT COUNT(*) AS total
        FROM asn_vulnerability_stats
        WHERE vulnerability_id = ?
      `, [vulnerabilityId]);
      
      res.json({
        success: true,
        data: {
          asns: asnList,
          total: countResult[0].total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的ASN列表失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取漏洞ASN列表失败: ${error.message}`
      });
    }
  };
  
  /**
   * 获取漏洞在各地区的影响
   */
  exports.getVulnerabilityRegions = async (req, res) => {
    try {
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      
      // 增强错误处理
      if (req.params.vulnerabilityId === undefined || req.params.vulnerabilityId === 'undefined') {
        logger.error(`获取漏洞地区分布失败: 漏洞ID为undefined`);
        return res.status(400).json({
          success: false,
          message: '无效的漏洞ID: 漏洞ID为undefined，请确保正确传递漏洞ID参数'
        });
      }
      
      if (isNaN(vulnerabilityId)) {
        logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的地区分布失败: 无效的漏洞ID格式`);
        return res.status(400).json({
          success: false,
          message: `无效的漏洞ID格式: ${req.params.vulnerabilityId}，请确保传递有效的数字ID`
        });
      }
      
      // 获取漏洞基本信息
      const [[vulnerabilityInfo]] = await db.query(`
        SELECT 
          vulnerability_id,
          cve_id,
          name,
          description,
          severity
        FROM 
          vulnerabilities
        WHERE 
          vulnerability_id = ?
      `, [vulnerabilityId]);
      
      if (!vulnerabilityInfo) {
        logger.error(`获取漏洞 ${vulnerabilityId} 的地区分布失败: 漏洞不存在`);
        return res.status(404).json({
          success: false,
          message: `未找到ID为 ${vulnerabilityId} 的漏洞信息`
        });
      }
      
      // 获取地区分布数据
      const [regionData] = await db.query(`
        SELECT 
          c.region,
          COUNT(DISTINCT av.address_id) AS affected_addresses,
          (
            SELECT SUM(total_active_ipv6) 
            FROM countries 
            WHERE region = c.region
          ) AS total_addresses,
          ROUND(COUNT(DISTINCT av.address_id) * 100.0 / (
            SELECT SUM(total_active_ipv6) 
            FROM countries 
            WHERE region = c.region
          ), 2) AS affected_percentage
        FROM 
          address_vulnerabilities av
        JOIN 
          active_addresses aa ON av.address_id = aa.address_id
        JOIN 
          ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        JOIN 
          countries c ON ip.country_id = c.country_id
        WHERE 
          av.vulnerability_id = ? AND av.is_fixed = 0
        GROUP BY 
          c.region
        ORDER BY 
          affected_addresses DESC
      `, [vulnerabilityId]);
      
      res.json({
        success: true,
        data: {
          vulnerability: vulnerabilityInfo,
          regions: regionData
        }
      });
    } catch (error) {
      logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的地区分布失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取漏洞地区分布失败: ${error.message}`
      });
    }
  };
  
  /**
   * 获取ASN中特定漏洞的详细信息
   */
  exports.getAsnVulnerabilityDetail = async (req, res) => {
    try {
      const asn = parseInt(req.params.asn);
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      
      // 增强错误处理
      if (req.params.asn === undefined || req.params.asn === 'undefined') {
        logger.error(`获取ASN漏洞详情失败: ASN为undefined`);
        return res.status(400).json({
          success: false,
          message: '无效的ASN: ASN为undefined，请确保正确传递ASN参数'
        });
      }
      
      if (req.params.vulnerabilityId === undefined || req.params.vulnerabilityId === 'undefined') {
        logger.error(`获取ASN漏洞详情失败: 漏洞ID为undefined`);
        return res.status(400).json({
          success: false,
          message: '无效的漏洞ID: 漏洞ID为undefined，请确保正确传递漏洞ID参数'
        });
      }
      
      if (isNaN(asn) || isNaN(vulnerabilityId)) {
        logger.error(`获取ASN ${req.params.asn} 的漏洞 ${req.params.vulnerabilityId} 详情失败: 无效的ASN或漏洞ID格式`);
        return res.status(400).json({
          success: false,
          message: `无效的ASN或漏洞ID格式: ASN=${req.params.asn}, 漏洞ID=${req.params.vulnerabilityId}，请确保传递有效的数字ID`
        });
      }
      
      // 获取ASN漏洞基本信息
      const [[asnVulnerabilityInfo]] = await db.query(`
        SELECT 
          avs.asn,
          avs.as_name,
          avs.as_name_zh,
          avs.country_id,
          avs.country_name,
          avs.country_name_zh,
          v.vulnerability_id,
          v.cve_id,
          v.name AS title,
          avs.affected_addresses,
          avs.total_active_ipv6,
          avs.affected_percentage
        FROM 
          asn_vulnerability_stats avs
        JOIN 
          vulnerabilities v ON avs.vulnerability_id = v.vulnerability_id
        WHERE 
          avs.asn = ? AND avs.vulnerability_id = ?
      `, [asn, vulnerabilityId]);
      
      if (!asnVulnerabilityInfo) {
        return res.status(404).json({
          success: false,
          message: `未找到ASN ${asn} 的漏洞 ${vulnerabilityId} 详情`
        });
      }
      
      // 获取前缀分布
      const [prefixDistribution] = await db.query(`
        SELECT 
          ip.prefix,
          ip.prefix_length,
          COUNT(DISTINCT av.address_id) AS affected_addresses,
          (
            SELECT COUNT(*) 
            FROM active_addresses aa 
            WHERE aa.prefix_id = ip.prefix_id
          ) AS total_addresses,
          ROUND(COUNT(DISTINCT av.address_id) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses aa 
            WHERE aa.prefix_id = ip.prefix_id
          ), 2) AS affected_percentage
        FROM 
          address_vulnerabilities av
        JOIN 
          active_addresses aa ON av.address_id = aa.address_id
        JOIN 
          ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
          ip.asn = ? AND av.vulnerability_id = ? AND av.is_fixed = 0
        GROUP BY 
          ip.prefix_id
        ORDER BY 
          affected_addresses DESC
        LIMIT 20
      `, [asn, vulnerabilityId]);
      
      res.json({
        success: true,
        data: {
          info: asnVulnerabilityInfo,
          prefixDistribution: prefixDistribution
        }
      });
    } catch (error) {
      logger.error(`获取ASN ${req.params.asn} 的漏洞 ${req.params.vulnerabilityId} 详情失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取ASN漏洞详情失败: ${error.message}`
      });
    }
  };
  
  /**
   * 获取漏洞影响的国家列表
   */
  exports.getVulnerabilityCountries = async (req, res) => {
    try {
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      const { limit = 50, offset = 0 } = req.query;
      
      if (isNaN(vulnerabilityId)) {
        return res.status(400).json({
          success: false,
          message: '无效的漏洞ID'
        });
      }
      
      // 获取国家列表
      const [countryList] = await db.query(`
        SELECT 
          c.country_id,
          c.country_name,
          c.country_name_zh,
          c.region,
          cvs.affected_addresses,
          c.total_active_ipv6,
          cvs.percentage AS affected_percentage
        FROM 
          country_vulnerability_stats cvs
        JOIN 
          countries c ON cvs.country_id = c.country_id
        WHERE 
          cvs.vulnerability_id = ?
        ORDER BY 
          cvs.affected_addresses DESC
        LIMIT ? OFFSET ?
      `, [vulnerabilityId, parseInt(limit), parseInt(offset)]);
      
      // 获取总记录数
      const [[countResult]] = await db.query(`
        SELECT COUNT(*) AS total
        FROM country_vulnerability_stats
        WHERE vulnerability_id = ?
      `, [vulnerabilityId]);
      
      res.json({
        success: true,
        data: {
          countries: countryList,
          total: countResult.total
        }
      });
    } catch (error) {
      logger.error(`获取漏洞 ${req.params.vulnerabilityId} 的国家列表失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取漏洞国家列表失败: ${error.message}`
      });
    }
  };

  /**
   * 获取国家中特定漏洞的详细信息
   */
  exports.getCountryVulnerabilityDetail = async (req, res) => {
    try {
      const countryId = req.params.countryId;
      const vulnerabilityId = parseInt(req.params.vulnerabilityId);
      
      if (!countryId || isNaN(vulnerabilityId)) {
        return res.status(400).json({
          success: false,
          message: '无效的国家ID或漏洞ID'
        });
      }
      
      // 获取国家漏洞基本信息
      const [[countryVulnerabilityInfo]] = await db.query(`
        SELECT 
          c.country_id,
          c.country_name,
          c.country_name_zh,
          c.region,
          v.vulnerability_id,
          v.cve_id,
          v.name AS title,
          v.description,
          v.severity,
          cvs.affected_addresses,
          c.total_active_ipv6,
          cvs.percentage AS affected_percentage
        FROM 
          country_vulnerability_stats cvs
        JOIN 
          countries c ON cvs.country_id = c.country_id
        JOIN 
          vulnerabilities v ON cvs.vulnerability_id = v.vulnerability_id
        WHERE 
          cvs.country_id = ? AND cvs.vulnerability_id = ?
      `, [countryId, vulnerabilityId]);
      
      
      if (!countryVulnerabilityInfo) {
        return res.status(404).json({
          success: false,
          message: `未找到国家 ${countryId} 的漏洞 ${vulnerabilityId} 详情`
        });
      }
      
      // 获取ASN分布
      const [asnDistribution] = await db.query(`
        SELECT 
          a.asn,
          a.as_name,
          a.as_name_zh,
          COUNT(DISTINCT av.address_id) AS affected_addresses,
          a.total_active_ipv6,
          ROUND(COUNT(DISTINCT av.address_id) * 100.0 / a.total_active_ipv6, 2) AS affected_percentage
        FROM 
          address_vulnerabilities av
        JOIN 
          active_addresses aa ON av.address_id = aa.address_id
        JOIN 
          ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        JOIN 
          asns a ON ip.asn = a.asn
        WHERE 
          ip.country_id = ? AND av.vulnerability_id = ? AND av.is_fixed = 0
        GROUP BY 
          a.asn
        ORDER BY 
          affected_addresses DESC
        LIMIT 20
      `, [countryId, vulnerabilityId]);
      
      // 获取前缀分布
      const [prefixDistribution] = await db.query(`
        SELECT 
          ip.prefix,
          ip.prefix_length,
          COUNT(DISTINCT av.address_id) AS affected_addresses,
          (
            SELECT COUNT(*) 
            FROM active_addresses aa 
            WHERE aa.prefix_id = ip.prefix_id
          ) AS total_addresses,
          ROUND(COUNT(DISTINCT av.address_id) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses aa 
            WHERE aa.prefix_id = ip.prefix_id
          ), 2) AS affected_percentage
        FROM 
          address_vulnerabilities av
        JOIN 
          active_addresses aa ON av.address_id = aa.address_id
        JOIN 
          ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
          ip.country_id = ? AND av.vulnerability_id = ? AND av.is_fixed = 0
        GROUP BY 
          ip.prefix_id
        ORDER BY 
          affected_addresses DESC
        LIMIT 20
      `, [countryId, vulnerabilityId]);
      
      res.json({
        success: true,
        data: {
          info: countryVulnerabilityInfo,
          asnDistribution: asnDistribution,
          prefixDistribution: prefixDistribution
        }
      });
    } catch (error) {
      logger.error(`获取国家 ${req.params.countryId} 的漏洞 ${req.params.vulnerabilityId} 详情失败: ${error.message}`, error);
      res.status(500).json({
        success: false,
        message: `获取国家漏洞详情失败: ${error.message}`
      });
    }
  };