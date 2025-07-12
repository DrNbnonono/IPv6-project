CREATE TRIGGER `after_asn_protocol_stats_delete` AFTER DELETE ON `asn_protocol_stats`
 FOR EACH ROW BEGIN
    CALL update_related_protocol_stats_for_asn(OLD.asn, OLD.protocol_id);
END

CREATE TRIGGER `after_asn_protocol_stats_insert` AFTER INSERT ON `asn_protocol_stats`
 FOR EACH ROW BEGIN
    CALL update_related_protocol_stats_for_asn(NEW.asn, NEW.protocol_id);
END

CREATE TRIGGER `after_asn_protocol_stats_update` AFTER UPDATE ON `asn_protocol_stats`
 FOR EACH ROW BEGIN
    
    IF OLD.affected_addresses <> NEW.affected_addresses OR OLD.total_active_ipv6 <> NEW.total_active_ipv6 THEN
        CALL update_related_protocol_stats_for_asn(NEW.asn, NEW.protocol_id);
    END IF;
END

CREATE TRIGGER `after_asn_vulnerability_stats_delete` AFTER DELETE ON `asn_vulnerability_stats`
 FOR EACH ROW BEGIN
    CALL update_related_vulnerability_stats_for_asn(OLD.asn, OLD.vulnerability_id);
END

CREATE TRIGGER `after_asn_vulnerability_stats_insert` AFTER INSERT ON `asn_vulnerability_stats`
 FOR EACH ROW BEGIN
    CALL update_related_vulnerability_stats_for_asn(NEW.asn, NEW.vulnerability_id);
END

CREATE TRIGGER `after_asn_vulnerability_stats_update` AFTER UPDATE ON `asn_vulnerability_stats`
 FOR EACH ROW BEGIN
    
    IF OLD.affected_addresses <> NEW.affected_addresses OR OLD.total_active_ipv6 <> NEW.total_active_ipv6 THEN
        CALL update_related_vulnerability_stats_for_asn(NEW.asn, NEW.vulnerability_id);
    END IF;
END

CREATE TRIGGER `after_protocol_delete` AFTER DELETE ON `address_protocols`
 FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_address_count INT;
    DECLARE v_total_addresses INT;
    DECLARE v_percentage DECIMAL(5,2);
    
    
    SELECT ip.country_id, ip.asn INTO v_country_id, v_asn
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = OLD.address_id;
    
    
    IF v_asn IS NOT NULL THEN
        
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn AND ap.protocol_id = OLD.protocol_id;
        
        
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.asn = v_asn;
        
        
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        
        IF v_address_count = 0 THEN
            DELETE FROM asn_protocol_stats
            WHERE asn = v_asn AND protocol_id = OLD.protocol_id;
        ELSE
            UPDATE asn_protocol_stats
            SET address_count = v_address_count,
                percentage = v_percentage,
                last_updated = NOW()
            WHERE asn = v_asn AND protocol_id = OLD.protocol_id;
        END IF;
    END IF;
    
    
    IF v_country_id IS NOT NULL THEN
        
        SELECT COUNT(*) INTO v_address_count
        FROM address_protocols ap
        JOIN active_addresses aa ON ap.address_id = aa.address_id
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id AND ap.protocol_id = OLD.protocol_id;
        
        
        SELECT COUNT(*) INTO v_total_addresses
        FROM active_addresses aa
        JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE ip.country_id = v_country_id;
        
        
        IF v_total_addresses > 0 THEN
            SET v_percentage = ROUND(v_address_count * 100.0 / v_total_addresses, 2);
        ELSE
            SET v_percentage = 0;
        END IF;
        
        
        IF v_address_count = 0 THEN
            DELETE FROM country_protocol_stats
            WHERE country_id = v_country_id AND protocol_id = OLD.protocol_id;
        ELSE
            UPDATE country_protocol_stats
            SET address_count = v_address_count,
                percentage = v_percentage,
                last_updated = NOW()
            WHERE country_id = v_country_id AND protocol_id = OLD.protocol_id;
        END IF;
    END IF;
END

CREATE TRIGGER `after_protocol_insert` AFTER INSERT ON `address_protocols`
 FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    DECLARE v_asn INT;
    DECLARE v_total_addresses INT;
    
    
    SELECT ip.country_id, ip.asn, COUNT(*) INTO v_country_id, v_asn, v_total_addresses
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id
    GROUP BY ip.country_id, ip.asn;
    
    
    IF v_asn IS NOT NULL THEN
        INSERT INTO asn_protocol_stats 
            (asn, protocol_id, address_count, percentage, last_updated)
        SELECT 
            v_asn,
            NEW.protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.asn = v_asn
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.asn = v_asn AND
            ap.protocol_id = NEW.protocol_id
        GROUP BY 
            ip.asn, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
    
    
    IF v_country_id IS NOT NULL THEN
        INSERT INTO country_protocol_stats 
            (country_id, protocol_id, address_count, percentage, last_updated)
        SELECT 
            v_country_id,
            NEW.protocol_id,
            COUNT(*),
            ROUND(COUNT(*) * 100.0 / (
                SELECT COUNT(*) 
                FROM active_addresses a
                JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
                WHERE p.country_id = v_country_id
            ), 2),
            NOW()
        FROM 
            address_protocols ap
        JOIN 
            active_addresses aa ON ap.address_id = aa.address_id
        JOIN 
            ip_prefixes ip ON aa.prefix_id = ip.prefix_id
        WHERE 
            ip.country_id = v_country_id AND
            ap.protocol_id = NEW.protocol_id
        GROUP BY 
            ip.country_id, ap.protocol_id
        ON DUPLICATE KEY UPDATE
            address_count = VALUES(address_count),
            percentage = VALUES(percentage),
            last_updated = NOW();
    END IF;
END

CREATE TRIGGER `after_vulnerability_insert` AFTER INSERT ON `address_vulnerabilities`
 FOR EACH ROW BEGIN
    DECLARE v_country_id CHAR(2);
    
    
    SELECT ip.country_id INTO v_country_id
    FROM active_addresses aa
    JOIN ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE aa.address_id = NEW.address_id;
    
    
    INSERT INTO country_vulnerability_stats 
        (country_id, vulnerability_id, affected_addresses, percentage, last_updated)
    SELECT 
        v_country_id,
        NEW.vulnerability_id,
        COUNT(*),
        ROUND(COUNT(*) * 100.0 / (
            SELECT COUNT(*) 
            FROM active_addresses a
            JOIN ip_prefixes p ON a.prefix_id = p.prefix_id
            WHERE p.country_id = v_country_id
        ), 2),
        NOW()
    FROM 
        address_vulnerabilities av
    JOIN 
        active_addresses aa ON av.address_id = aa.address_id
    JOIN 
        ip_prefixes ip ON aa.prefix_id = ip.prefix_id
    WHERE 
        ip.country_id = v_country_id AND
        av.vulnerability_id = NEW.vulnerability_id AND
        av.is_fixed = 0
    GROUP BY 
        ip.country_id, av.vulnerability_id
    ON DUPLICATE KEY UPDATE
        affected_addresses = VALUES(affected_addresses),
        percentage = VALUES(percentage),
        last_updated = NOW();
END
