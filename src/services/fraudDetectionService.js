import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { extractIP } from '../utils/ipExtractor.js';
import { getCountryFromHeaders } from '../utils/countryLookup.js';

export class FraudDetectionService {
  /**
   * Main fraud check entry point - checks all fraud rules
   * @param {Object} data - Click/conversion data
   * @param {string} eventType - 'click' or 'conversion'
   * @param {Object} request - HTTP request object
   * @returns {Object} - { isFraud: boolean, reasonCode: string, reasonText: string, score: number }
   */
  async checkFraud(data, eventType, request) {
    try {
      const { offer_id, publisher_id, click_id, conversion_id, device_id, ip, user_agent } = data;
      
      // Get all active fraud rules for this offer/publisher
      const rules = await this.getActiveRules(offer_id, publisher_id);
      
      let fraudScore = 0;
      const reasons = [];
      let shouldReject = false;
      let rejectionReasonCode = null;
      let rejectionReasonText = null;

      // Check each rule
      for (const rule of rules) {
        const checkResult = await this.evaluateRule(rule, data, eventType, request);
        
        if (checkResult.isFraud) {
          fraudScore += checkResult.score || 10;
          reasons.push({
            ruleId: rule.id,
            ruleName: rule.rule_name,
            reason: checkResult.reason,
            score: checkResult.score || 10,
          });

          // If action is reject, mark for rejection
          if (rule.action === 'reject_click' && eventType === 'click') {
            shouldReject = true;
            rejectionReasonCode = checkResult.reasonCode || 'FRAUD_DETECTED';
            rejectionReasonText = checkResult.reason || rule.rule_name;
          } else if (rule.action === 'reject_conversion' && eventType === 'conversion') {
            shouldReject = true;
            rejectionReasonCode = checkResult.reasonCode || 'FRAUD_DETECTED';
            rejectionReasonText = checkResult.reason || rule.rule_name;
          } else if (rule.action === 'flag_conversion' && eventType === 'conversion') {
            // Flag but don't reject
            rejectionReasonCode = 'FLAGGED';
            rejectionReasonText = checkResult.reason || rule.rule_name;
          }
        }
      }

      // Check IP frequency
      const ipFreqCheck = await this.checkIPFrequency(ip, offer_id, publisher_id, eventType);
      if (ipFreqCheck.isFraud) {
        fraudScore += ipFreqCheck.score || 15;
        reasons.push({
          ruleName: 'IP Frequency Check',
          reason: ipFreqCheck.reason,
          score: ipFreqCheck.score || 15,
        });
        if (ipFreqCheck.shouldReject) {
          shouldReject = true;
          rejectionReasonCode = 'IP_FREQUENCY_EXCEEDED';
          rejectionReasonText = ipFreqCheck.reason;
        }
      }

      // Check device duplication
      if (device_id) {
        const deviceCheck = await this.checkDeviceDuplication(device_id, offer_id, publisher_id, ip);
        if (deviceCheck.isFraud) {
          fraudScore += deviceCheck.score || 20;
          reasons.push({
            ruleName: 'Device Duplication Check',
            reason: deviceCheck.reason,
            score: deviceCheck.score || 20,
          });
          if (deviceCheck.shouldReject) {
            shouldReject = true;
            rejectionReasonCode = 'DEVICE_DUPLICATION';
            rejectionReasonText = deviceCheck.reason;
          }
        }
      }

      // Check user-agent blacklist
      if (user_agent) {
        const uaCheck = await this.checkUserAgentBlacklist(user_agent);
        if (uaCheck.isFraud) {
          fraudScore += uaCheck.score || 30;
          reasons.push({
            ruleName: 'User-Agent Blacklist',
            reason: uaCheck.reason,
            score: uaCheck.score || 30,
          });
          shouldReject = true;
          rejectionReasonCode = 'BLACKLISTED_USER_AGENT';
          rejectionReasonText = uaCheck.reason;
        }
      }

      // Check VPN/Proxy
      const vpnCheck = await this.checkVPNProxy(ip);
      if (vpnCheck.isFraud) {
        fraudScore += vpnCheck.score || 25;
        reasons.push({
          ruleName: 'VPN/Proxy Detection',
          reason: vpnCheck.reason,
          score: vpnCheck.score || 25,
        });
        if (vpnCheck.shouldReject) {
          shouldReject = true;
          rejectionReasonCode = 'VPN_PROXY_DETECTED';
          rejectionReasonText = vpnCheck.reason;
        }
      }

      // Check IP blacklist/whitelist
      const ipListCheck = await this.checkIPAccessList(ip, offer_id, publisher_id);
      if (ipListCheck.isFraud) {
        fraudScore += ipListCheck.score || 50;
        reasons.push({
          ruleName: 'IP Access List',
          reason: ipListCheck.reason,
          score: ipListCheck.score || 50,
        });
        shouldReject = true;
        rejectionReasonCode = 'IP_BLACKLISTED';
        rejectionReasonText = ipListCheck.reason;
      }

      // Check geo mismatch
      if (eventType === 'conversion' || eventType === 'click') {
        const geoCheck = await this.checkGeoMismatch(ip, request, offer_id);
        if (geoCheck.isFraud) {
          fraudScore += geoCheck.score || 15;
          reasons.push({
            ruleName: 'Geo Mismatch',
            reason: geoCheck.reason,
            score: geoCheck.score || 15,
          });
          if (geoCheck.shouldReject) {
            shouldReject = true;
            rejectionReasonCode = 'GEO_MISMATCH';
            rejectionReasonText = geoCheck.reason;
          }
        }
      }

      // Check bot patterns
      const botCheck = await this.checkBotPatterns(user_agent, ip, data);
      if (botCheck.isFraud) {
        fraudScore += botCheck.score || 40;
        reasons.push({
          ruleName: 'Bot Detection',
          reason: botCheck.reason,
          score: botCheck.score || 40,
        });
        shouldReject = true;
        rejectionReasonCode = 'BOT_DETECTED';
        rejectionReasonText = botCheck.reason;
      }

      // Log fraud event if detected
      if (shouldReject || fraudScore > 0) {
        await this.logFraudEvent({
          eventType: shouldReject 
            ? (eventType === 'click' ? 'click_rejected' : 'conversion_rejected')
            : 'conversion_flagged',
          click_id,
          conversion_id,
          offer_id,
          publisher_id,
          rejection_reason_code: rejectionReasonCode || 'FRAUD_DETECTED',
          rejection_reason_text: rejectionReasonText || reasons.map(r => r.reason).join('; '),
          ip,
          device_id,
          user_agent,
          fraud_score: fraudScore,
          metadata: { reasons, rules: rules.map(r => ({ id: r.id, name: r.rule_name })) },
        });
      }

      return {
        isFraud: shouldReject || fraudScore >= 50,
        reasonCode: rejectionReasonCode,
        reasonText: rejectionReasonText || reasons.map(r => r.reason).join('; '),
        score: fraudScore,
        reasons,
      };
    } catch (error) {
      logger.error('FraudDetectionService.checkFraud error:', error);
      // On error, don't block - log and allow
      return { isFraud: false, reasonCode: null, reasonText: null, score: 0, reasons: [] };
    }
  }

  /**
   * Get active fraud rules for offer/publisher
   */
  async getActiveRules(offerId, publisherId) {
    const [rows] = await pool.query(
      `SELECT * FROM fraud_rules 
       WHERE is_active = 1 
       AND (
         rule_type = 'global' 
         OR (rule_type = 'offer' AND offer_id = ?)
         OR (rule_type = 'publisher' AND publisher_id = ?)
       )
       ORDER BY rule_type DESC, id ASC`,
      [offerId, publisherId]
    );
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * Evaluate a specific fraud rule
   */
  async evaluateRule(rule, data, eventType, request) {
    const config = typeof rule.rule_config === 'string' 
      ? JSON.parse(rule.rule_config) 
      : rule.rule_config;

    // Rule-specific evaluation logic
    switch (rule.rule_name.toLowerCase()) {
      case 'ip frequency check':
        return await this.checkIPFrequency(
          data.ip, 
          data.offer_id, 
          data.publisher_id, 
          eventType,
          config
        );
      case 'device duplication check':
        return await this.checkDeviceDuplication(
          data.device_id, 
          data.offer_id, 
          data.publisher_id, 
          data.ip,
          config
        );
      default:
        return { isFraud: false };
    }
  }

  /**
   * Check IP frequency (clicks/conversions per time period)
   */
  async checkIPFrequency(ip, offerId, publisherId, eventType, config = {}) {
    if (!ip) return { isFraud: false };

    const maxClicksPerHour = config.max_clicks_per_hour || 100;
    const maxClicksPerDay = config.max_clicks_per_day || 1000;
    const maxConversionsPerHour = config.max_conversions_per_hour || 10;

    // Log this event
    await pool.query(
      `INSERT INTO ip_frequency_logs (ip, offer_id, publisher_id, event_type, timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [ip, offerId, publisherId, eventType]
    );

    // Check hourly frequency
    const [hourlyRows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM ip_frequency_logs 
       WHERE ip = ? AND offer_id = ? AND event_type = ? 
       AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [ip, offerId, eventType]
    );
    const hourlyCount = parseInt((Array.isArray(hourlyRows) ? hourlyRows[0] : hourlyRows).cnt || 0);

    // Check daily frequency
    const [dailyRows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM ip_frequency_logs 
       WHERE ip = ? AND offer_id = ? AND event_type = ? 
       AND DATE(timestamp) = CURDATE()`,
      [ip, offerId, eventType]
    );
    const dailyCount = parseInt((Array.isArray(dailyRows) ? dailyRows[0] : dailyRows).cnt || 0);

    if (eventType === 'click') {
      if (hourlyCount >= maxClicksPerHour) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `IP exceeded hourly click limit: ${hourlyCount}/${maxClicksPerHour}`,
          reasonCode: 'IP_FREQUENCY_HOUR',
          score: 15,
        };
      }
      if (dailyCount >= maxClicksPerDay) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `IP exceeded daily click limit: ${dailyCount}/${maxClicksPerDay}`,
          reasonCode: 'IP_FREQUENCY_DAY',
          score: 20,
        };
      }
    } else if (eventType === 'conversion') {
      if (hourlyCount >= maxConversionsPerHour) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `IP exceeded hourly conversion limit: ${hourlyCount}/${maxConversionsPerHour}`,
          reasonCode: 'IP_FREQUENCY_CONV_HOUR',
          score: 25,
        };
      }
    }

    return { isFraud: false };
  }

  /**
   * Check device duplication
   */
  async checkDeviceDuplication(deviceId, offerId, publisherId, ip, config = {}) {
    if (!deviceId) return { isFraud: false };

    const maxDevicesPerIP = config.max_devices_per_ip || 5;
    const maxClicksPerDevicePerHour = config.max_clicks_per_device_per_hour || 50;

    // Update device tracking
    await pool.query(
      `INSERT INTO device_tracking (device_id, offer_id, publisher_id, ip, click_count, first_seen, last_seen)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE 
         click_count = click_count + 1,
         last_seen = NOW()`,
      [deviceId, offerId, publisherId, ip]
    );

    // Check how many devices from same IP
    const [deviceRows] = await pool.query(
      `SELECT COUNT(DISTINCT device_id) as device_count 
       FROM device_tracking 
       WHERE ip = ? AND offer_id = ? AND last_seen >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [ip, offerId]
    );
    const deviceCount = parseInt((Array.isArray(deviceRows) ? deviceRows[0] : deviceRows).device_count || 0);

    if (deviceCount > maxDevicesPerIP) {
      return {
        isFraud: true,
        shouldReject: true,
        reason: `Too many devices from same IP: ${deviceCount}/${maxDevicesPerIP}`,
        reasonCode: 'DEVICE_DUPLICATION_IP',
        score: 20,
      };
    }

    // Check clicks per device per hour
    const [clickRows] = await pool.query(
      `SELECT click_count FROM device_tracking 
       WHERE device_id = ? AND offer_id = ? AND last_seen >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [deviceId, offerId]
    );
    const deviceClicks = parseInt((Array.isArray(clickRows) ? clickRows[0] : clickRows).click_count || 0);

    if (deviceClicks > maxClicksPerDevicePerHour) {
      return {
        isFraud: true,
        shouldReject: true,
        reason: `Device exceeded hourly click limit: ${deviceClicks}/${maxClicksPerDevicePerHour}`,
        reasonCode: 'DEVICE_FREQUENCY',
        score: 25,
      };
    }

    return { isFraud: false };
  }

  /**
   * Check user-agent blacklist
   */
  async checkUserAgentBlacklist(userAgent) {
    if (!userAgent) return { isFraud: false };

    const [rows] = await pool.query(
      `SELECT * FROM user_agent_blacklist WHERE is_active = 1`,
      []
    );
    const blacklist = Array.isArray(rows) ? rows : [];

    for (const entry of blacklist) {
      let matches = false;
      
      if (entry.match_type === 'exact') {
        matches = userAgent === entry.pattern;
      } else if (entry.match_type === 'contains') {
        matches = userAgent.includes(entry.pattern);
      } else if (entry.match_type === 'regex') {
        try {
          const regex = new RegExp(entry.pattern, 'i');
          matches = regex.test(userAgent);
        } catch (e) {
          logger.warn(`Invalid regex pattern in blacklist: ${entry.pattern}`);
        }
      }

      if (matches) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `User-Agent matches blacklist: ${entry.pattern}`,
          reasonCode: 'BLACKLISTED_UA',
          score: 30,
        };
      }
    }

    return { isFraud: false };
  }

  /**
   * Check VPN/Proxy (with caching)
   */
  async checkVPNProxy(ip) {
    if (!ip) return { isFraud: false };

    // Check cache first
    const [cacheRows] = await pool.query(
      `SELECT * FROM vpn_proxy_cache 
       WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())`,
      [ip]
    );
    const cached = Array.isArray(cacheRows) ? cacheRows[0] : cacheRows;

    if (cached) {
      if (cached.is_vpn || cached.is_proxy || cached.is_tor) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `VPN/Proxy detected: ${cached.is_vpn ? 'VPN' : ''} ${cached.is_proxy ? 'Proxy' : ''} ${cached.is_tor ? 'Tor' : ''}`.trim(),
          reasonCode: 'VPN_PROXY',
          score: 25,
        };
      }
      return { isFraud: false };
    }

    // TODO: Integrate with external VPN/Proxy detection API (e.g., ipapi.co, ip-api.com)
    // For now, return false (no VPN detected)
    // You can add integration here:
    // const vpnCheck = await this.checkExternalVPNService(ip);
    // await this.cacheVPNResult(ip, vpnCheck);

    return { isFraud: false };
  }

  /**
   * Check IP access list (blacklist/whitelist)
   */
  async checkIPAccessList(ip, offerId, publisherId) {
    if (!ip) return { isFraud: false };

    // Check global blacklist
    const [globalBlacklist] = await pool.query(
      `SELECT * FROM ip_access_lists 
       WHERE list_type = 'blacklist' AND scope = 'global' AND is_active = 1 
       AND ip_address = ?`,
      [ip]
    );

    if (globalBlacklist && globalBlacklist.length > 0) {
      return {
        isFraud: true,
        shouldReject: true,
        reason: `IP is globally blacklisted`,
        reasonCode: 'IP_BLACKLISTED_GLOBAL',
        score: 50,
      };
    }

    // Check offer-specific blacklist
    if (offerId) {
      const [offerBlacklist] = await pool.query(
        `SELECT * FROM ip_access_lists 
         WHERE list_type = 'blacklist' AND scope = 'offer' AND offer_id = ? AND is_active = 1 
         AND ip_address = ?`,
        [offerId, ip]
      );

      if (offerBlacklist && offerBlacklist.length > 0) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `IP is blacklisted for this offer`,
          reasonCode: 'IP_BLACKLISTED_OFFER',
          score: 50,
        };
      }
    }

    // Check publisher-specific blacklist
    if (publisherId) {
      const [pubBlacklist] = await pool.query(
        `SELECT * FROM ip_access_lists 
         WHERE list_type = 'blacklist' AND scope = 'publisher' AND publisher_id = ? AND is_active = 1 
         AND ip_address = ?`,
        [publisherId, ip]
      );

      if (pubBlacklist && pubBlacklist.length > 0) {
        return {
          isFraud: true,
          shouldReject: true,
          reason: `IP is blacklisted for this publisher`,
          reasonCode: 'IP_BLACKLISTED_PUBLISHER',
          score: 50,
        };
      }
    }

    return { isFraud: false };
  }

  /**
   * Check geo mismatch
   */
  async checkGeoMismatch(ip, request, offerId) {
    if (!ip) return { isFraud: false };

    const ipCountry = await this.getIPCountry(ip);
    const headerCountry = getCountryFromHeaders(request);

    if (ipCountry && headerCountry && ipCountry !== headerCountry) {
      // Log geo mismatch
      await pool.query(
        `INSERT INTO geo_mismatch_logs (ip, ip_country, reported_country, mismatch_type, severity)
         VALUES (?, ?, ?, 'ip_vs_header', 'high')`,
        [ip, ipCountry, headerCountry]
      );

      return {
        isFraud: true,
        shouldReject: false, // Flag but don't reject by default
        reason: `Geo mismatch: IP country (${ipCountry}) != Header country (${headerCountry})`,
        reasonCode: 'GEO_MISMATCH',
        score: 15,
      };
    }

    return { isFraud: false };
  }

  /**
   * Check bot patterns
   */
  async checkBotPatterns(userAgent, ip, data) {
    if (!userAgent) return { isFraud: false };

    const [rows] = await pool.query(
      `SELECT * FROM bot_patterns WHERE is_active = 1`,
      []
    );
    const patterns = Array.isArray(rows) ? rows : [];

    for (const pattern of patterns) {
      if (pattern.user_agent_pattern) {
        try {
          const regex = new RegExp(pattern.user_agent_pattern.replace(/%/g, '.*'), 'i');
          if (regex.test(userAgent)) {
            return {
              isFraud: true,
              shouldReject: true,
              reason: `Bot pattern matched: ${pattern.pattern_name}`,
              reasonCode: 'BOT_DETECTED',
              score: 40,
            };
          }
        } catch (e) {
          logger.warn(`Invalid bot pattern: ${pattern.user_agent_pattern}`);
        }
      }
    }

    // Check for empty user agent
    if (!userAgent || userAgent.trim() === '') {
      return {
        isFraud: true,
        shouldReject: true,
        reason: 'Empty user agent detected',
        reasonCode: 'EMPTY_USER_AGENT',
        score: 30,
      };
    }

    return { isFraud: false };
  }

  /**
   * Get IP country (simplified - can integrate with GeoIP service)
   */
  async getIPCountry(ip) {
    // TODO: Integrate with GeoIP service
    // For now, return null
    return null;
  }

  /**
   * Log fraud event
   */
  async logFraudEvent(data) {
    try {
      await pool.query(
        `INSERT INTO fraud_logs (
          event_type, click_id, conversion_id, offer_id, publisher_id, rule_id,
          rejection_reason_code, rejection_reason_text, ip, device_id, user_agent,
          fraud_score, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          data.eventType,
          data.click_id || null,
          data.conversion_id || null,
          data.offer_id,
          data.publisher_id,
          data.rule_id || null,
          data.rejection_reason_code,
          data.rejection_reason_text,
          data.ip || null,
          data.device_id || null,
          data.user_agent || null,
          data.fraud_score || 0,
          JSON.stringify(data.metadata || {}),
        ]
      );
    } catch (error) {
      logger.error('FraudDetectionService.logFraudEvent error:', error);
    }
  }

  /**
   * Calculate publisher fraud score
   */
  async calculatePublisherFraudScore(publisherId) {
    try {
      // Get fraud events for this publisher in last 30 days
      const [rows] = await pool.query(
        `SELECT 
          COUNT(*) as fraud_count,
          AVG(fraud_score) as avg_score,
          SUM(CASE WHEN event_type = 'conversion_rejected' THEN 1 ELSE 0 END) as rejected_conversions,
          SUM(CASE WHEN event_type = 'click_rejected' THEN 1 ELSE 0 END) as rejected_clicks
         FROM fraud_logs
         WHERE publisher_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [publisherId]
      );

      const stats = Array.isArray(rows) ? rows[0] : rows;
      const fraudCount = parseInt(stats.fraud_count || 0);
      const avgScore = parseFloat(stats.avg_score || 0);
      const rejectedConversions = parseInt(stats.rejected_conversions || 0);
      const rejectedClicks = parseInt(stats.rejected_clicks || 0);

      // Calculate total conversions/clicks for ratio
      const [convRows] = await pool.query(
        `SELECT COUNT(*) as total FROM conversions WHERE publisher_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [publisherId]
      );
      const totalConversions = parseInt((Array.isArray(convRows) ? convRows[0] : convRows).total || 0);

      const [clickRows] = await pool.query(
        `SELECT COUNT(*) as total FROM clicks WHERE publisher_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [publisherId]
      );
      const totalClicks = parseInt((Array.isArray(clickRows) ? clickRows[0] : clickRows).total || 0);

      // Calculate fraud score (0-100)
      let score = 0;
      if (totalConversions > 0) {
        score += (rejectedConversions / totalConversions) * 50;
      }
      if (totalClicks > 0) {
        score += (rejectedClicks / totalClicks) * 30;
      }
      score += Math.min(avgScore / 2, 20); // Average fraud score contribution

      score = Math.min(100, Math.max(0, score));

      // Determine risk level
      let riskLevel = 'low';
      if (score >= 70) riskLevel = 'critical';
      else if (score >= 50) riskLevel = 'high';
      else if (score >= 30) riskLevel = 'medium';

      // Update publisher fraud score
      await pool.query(
        `INSERT INTO publisher_fraud_scores (publisher_id, fraud_score, risk_level, factors, last_calculated)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           fraud_score = VALUES(fraud_score),
           risk_level = VALUES(risk_level),
           factors = VALUES(factors),
           last_calculated = NOW()`,
        [
          publisherId,
          score,
          riskLevel,
          JSON.stringify({
            fraudCount,
            avgScore,
            rejectedConversions,
            rejectedClicks,
            totalConversions,
            totalClicks,
          }),
        ]
      );

      return { score, riskLevel };
    } catch (error) {
      logger.error('FraudDetectionService.calculatePublisherFraudScore error:', error);
      return { score: 0, riskLevel: 'low' };
    }
  }

  /**
   * Get fraud logs with filters
   */
  async getFraudLogs(filters = {}) {
    let query = `SELECT fl.*, 
                        o.name as offer_name,
                        p.email as publisher_email,
                        fr.rule_name as rule_name
                 FROM fraud_logs fl
                 LEFT JOIN offers o ON fl.offer_id = o.id
                 LEFT JOIN publishers p ON fl.publisher_id = p.id
                 LEFT JOIN fraud_rules fr ON fl.rule_id = fr.id
                 WHERE 1=1`;
    const params = [];

    if (filters.offer_id) {
      query += ` AND fl.offer_id = ?`;
      params.push(filters.offer_id);
    }

    if (filters.publisher_id) {
      query += ` AND fl.publisher_id = ?`;
      params.push(filters.publisher_id);
    }

    if (filters.event_type) {
      query += ` AND fl.event_type = ?`;
      params.push(filters.event_type);
    }

    if (filters.rejection_reason_code) {
      query += ` AND fl.rejection_reason_code = ?`;
      params.push(filters.rejection_reason_code);
    }

    if (filters.start_date) {
      query += ` AND fl.created_at >= ?`;
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      query += ` AND fl.created_at <= ?`;
      params.push(filters.end_date);
    }

    query += ` ORDER BY fl.created_at DESC LIMIT ? OFFSET ?`;
    params.push(filters.limit || 100, filters.offset || 0);

    const [rows] = await pool.query(query, params);
    return Array.isArray(rows) ? rows : [];
  }
}

export default new FraudDetectionService();
