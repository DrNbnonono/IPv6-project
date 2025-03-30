const db = require('../database/db');

/**
 * 地址相关数据模型
 */
module.exports = {
  /**
   * 更新国家统计信息
   */
  async updateCountryStats(countryId) {
    try {
      // 更新国家IPv6前缀数量
      await db.query(`
        UPDATE countries c
        SET c.total_ipv6_prefixes = (
          SELECT COUNT(*) 
          FROM ip_prefixes 
          WHERE country_id = ? AND version = '6'
        )
        WHERE c.country_id = ?
      `, [countryId, countryId]);

      // 更新国家活跃IPv6地址数量
      await db.query(`
        UPDATE countries c
        SET c.total_active_ipv6 = (
          SELECT COUNT(*) 
          FROM active_addresses a
          JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
          WHERE p.country_id = ? AND a.version = '6'
        )
        WHERE c.country_id = ?
      `, [countryId, countryId]);

      // 更新国家协议使用统计
      await db.query(`
        INSERT INTO country_protocol_stats (country_id, protocol_id, address_count, percentage)
        SELECT 
          p.country_id,
          ap.protocol_id,
          COUNT(*) as address_count,
          ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses a
            JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
            WHERE p.country_id = ?
          ), 2) as percentage
        FROM address_protocols ap
        JOIN active_addresses a ON ap.address_id = a.address_id
        JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
        WHERE p.country_id = ?
        GROUP BY p.country_id, ap.protocol_id
        ON DUPLICATE KEY UPDATE
          address_count = VALUES(address_count),
          percentage = VALUES(percentage),
          last_updated = CURRENT_TIMESTAMP
      `, [countryId, countryId]);

      // 更新国家漏洞统计
      await db.query(`
        INSERT INTO country_vulnerability_stats (country_id, vulnerability_id, affected_addresses, percentage)
        SELECT 
          p.country_id,
          av.vulnerability_id,
          COUNT(*) as affected_addresses,
          ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses a
            JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
            WHERE p.country_id = ?
          ), 2) as percentage
        FROM address_vulnerabilities av
        JOIN active_addresses a ON av.address_id = a.address_id
        JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
        WHERE p.country_id = ? AND av.is_fixed = 0
        GROUP BY p.country_id, av.vulnerability_id
        ON DUPLICATE KEY UPDATE
          affected_addresses = VALUES(affected_addresses),
          percentage = VALUES(percentage),
          last_updated = CURRENT_TIMESTAMP
      `, [countryId, countryId]);

      return true;
    } catch (error) {
      console.error('更新国家统计信息失败:', error);
      throw error;
    }
  },

  /**
   * 更新ASN统计信息
   */
  async updateAsnStats(asn) {
    try {
      // 更新ASN IPv6前缀数量
      await db.query(`
        UPDATE asns a
        SET a.total_ipv6_prefixes = (
          SELECT COUNT(*) 
          FROM ip_prefixes 
          WHERE asn = ? AND version = '6'
        )
        WHERE a.asn = ?
      `, [asn, asn]);

      // 更新ASN活跃IPv6地址数量
      await db.query(`
        UPDATE asns a
        SET a.total_active_ipv6 = (
          SELECT COUNT(*) 
          FROM active_addresses aa
          JOIN ip_prefixes p ON aa.prefix_id = p.prefix_id
          WHERE p.asn = ? AND aa.version = '6'
        )
        WHERE a.asn = ?
      `, [asn, asn]);

      // 更新ASN协议使用统计
      await db.query(`
        INSERT INTO asn_protocol_stats (asn, protocol_id, address_count, percentage)
        SELECT 
          p.asn,
          ap.protocol_id,
          COUNT(*) as address_count,
          ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses a
            JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
            WHERE p.asn = ?
          ), 2) as percentage
        FROM address_protocols ap
        JOIN active_addresses a ON ap.address_id = a.address_id
        JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
        WHERE p.asn = ?
        GROUP BY p.asn, ap.protocol_id
        ON DUPLICATE KEY UPDATE
          address_count = VALUES(address_count),
          percentage = VALUES(percentage),
          last_updated = CURRENT_TIMESTAMP
      `, [asn, asn]);

      return true;
    } catch (error) {
      console.error('更新ASN统计信息失败:', error);
      throw error;
    }
  },

  /**
   * 批量插入活跃地址
   */
  async batchInsertActiveAddresses(addresses) {
    try {
      // 使用事务确保数据一致性
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // 批量插入地址
        const [result] = await connection.query(`
          INSERT INTO active_addresses 
            (address, version, prefix_id, first_seen, last_seen, uptime_percentage, iid_type)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            last_seen = VALUES(last_seen),
            uptime_percentage = VALUES(uptime_percentage)
        `, [addresses.map(addr => [
          addr.address,
          addr.version,
          addr.prefix_id,
          addr.first_seen || new Date(),
          addr.last_seen || new Date(),
          addr.uptime_percentage || 100,
          addr.iid_type || null
        ])]);

        // 更新相关统计信息
        const affectedPrefixes = [...new Set(addresses.map(addr => addr.prefix_id))];
        for (const prefixId of affectedPrefixes) {
          const [[prefix]] = await connection.query(`
            SELECT asn, country_id FROM ip_prefixes WHERE prefix_id = ?
          `, [prefixId]);

          if (prefix) {
            await this.updateAsnStats(prefix.asn);
            await this.updateCountryStats(prefix.country_id);
          }
        }

        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('批量插入活跃地址失败:', error);
      throw error;
    }
  }
};