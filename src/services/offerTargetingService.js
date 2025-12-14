import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { extractIP } from '../utils/ipExtractor.js';
import { getCountryFromHeaders } from '../utils/countryLookup.js';
import { parseDevice } from '../utils/deviceParser.js';

export class OfferTargetingService {
  /**
   * Evaluate all targeting rules for an offer before recording click
   * Returns { passed: boolean, reason: string, failedRule: string }
   */
  async evaluateTargeting(offer, publisherId, request, query) {
    try {
      const ip = extractIP(request);
      const userAgent = request.headers['user-agent'] || '';
      const deviceInfo = parseDevice(userAgent);
      const country = getCountryFromHeaders(request) || null;

      // Default rule order if not specified
      const ruleOrder = offer.targeting_rule_order 
        ? offer.targeting_rule_order.split(',').map(r => r.trim())
        : ['geo', 'device', 'os', 'browser', 'connection', 'carrier', 'schedule', 'ip', 'publisher'];

      const strictMode = offer.targeting_strict_mode === 1;
      const results = [];

      // Evaluate each rule in order
      for (const ruleType of ruleOrder) {
        const result = await this.evaluateRule(ruleType, offer, publisherId, {
          ip,
          country,
          deviceInfo,
          userAgent,
          query,
          request,
        });

        results.push({
          ruleType,
          passed: result.passed,
          reason: result.reason,
        });

        // Log rule evaluation
        await this.logRuleEvaluation(null, offer.id, publisherId, ruleType, result.passed ? 'passed' : 'failed', result.details || {});

        // In strict mode, any failure blocks
        if (strictMode && !result.passed) {
          return {
            passed: false,
            reason: result.reason,
            failedRule: ruleType,
            results,
          };
        }

        // In non-strict mode, critical failures (geo, ip) still block
        if (!strictMode && !result.passed && ['geo', 'ip'].includes(ruleType)) {
          return {
            passed: false,
            reason: result.reason,
            failedRule: ruleType,
            results,
          };
        }
      }

      // Check if any critical rule failed
      const criticalFailures = results.filter(r => !r.passed && ['geo', 'ip'].includes(r.ruleType));
      if (criticalFailures.length > 0) {
        return {
          passed: false,
          reason: criticalFailures[0].reason,
          failedRule: criticalFailures[0].ruleType,
          results,
        };
      }

      return {
        passed: true,
        reason: 'All targeting rules passed',
        results,
      };
    } catch (error) {
      logger.error('OfferTargetingService.evaluateTargeting error:', error);
      // On error, allow (don't block)
      return { passed: true, reason: 'Targeting evaluation error', results: [] };
    }
  }

  /**
   * Evaluate a specific rule type
   */
  async evaluateRule(ruleType, offer, publisherId, context) {
    switch (ruleType) {
      case 'geo':
        return await this.evaluateGeoRule(offer, publisherId, context);
      case 'device':
        return await this.evaluateDeviceRule(offer, context);
      case 'os':
        return await this.evaluateOSRule(offer, context);
      case 'browser':
        return await this.evaluateBrowserRule(offer, context);
      case 'connection':
        return await this.evaluateConnectionRule(offer, context);
      case 'carrier':
        return await this.evaluateCarrierRule(offer, context);
      case 'schedule':
        return await this.evaluateScheduleRule(offer, context);
      case 'ip':
        return await this.evaluateIPRule(offer, publisherId, context);
      case 'publisher':
        return await this.evaluatePublisherRule(offer, publisherId, context);
      default:
        return { passed: true, reason: `Unknown rule type: ${ruleType}` };
    }
  }

  /**
   * Evaluate geo targeting
   */
  async evaluateGeoRule(offer, publisherId, context) {
    const { country } = context;

    // Check publisher-specific geo override
    const [overrideRows] = await pool.query(
      `SELECT * FROM publisher_targeting_overrides 
       WHERE publisher_id = ? AND (offer_id = ? OR offer_id IS NULL) AND is_active = 1
       ORDER BY offer_id DESC LIMIT 1`,
      [publisherId, offer.id]
    );
    const override = Array.isArray(overrideRows) ? overrideRows[0] : overrideRows;

    if (override) {
      if (override.geo_blocked) {
        const blocked = typeof override.geo_blocked === 'string' ? JSON.parse(override.geo_blocked) : override.geo_blocked;
        if (Array.isArray(blocked) && blocked.includes(country)) {
          return {
            passed: false,
            reason: `Country ${country} is blocked for this publisher`,
            details: { country, override: 'publisher_blocked' },
          };
        }
      }
      if (override.geo_allowed) {
        const allowed = typeof override.geo_allowed === 'string' ? JSON.parse(override.geo_allowed) : override.geo_allowed;
        if (Array.isArray(allowed) && !allowed.includes(country)) {
          return {
            passed: false,
            reason: `Country ${country} is not in allowed list for this publisher`,
            details: { country, override: 'publisher_allowed' },
          };
        }
      }
    }

    // Check offer-level geo targeting
    if (offer.country && country) {
      const offerCountries = offer.country.split(',').map(c => c.trim());
      if (!offerCountries.includes(country)) {
        return {
          passed: false,
          reason: `Country ${country} not allowed for this offer`,
          details: { country, allowed: offerCountries },
        };
      }
    }

    // Check city targeting if configured
    if (offer.city_targeting_json) {
      const cityTargeting = typeof offer.city_targeting_json === 'string' 
        ? JSON.parse(offer.city_targeting_json) 
        : offer.city_targeting_json;
      
      if (cityTargeting.allowed && Array.isArray(cityTargeting.allowed) && cityTargeting.allowed.length > 0) {
        // Would need city from IP lookup - simplified for now
        // return { passed: false, reason: 'City not in allowed list' };
      }
    }

    return { passed: true, reason: 'Geo targeting passed' };
  }

  /**
   * Evaluate device targeting
   */
  async evaluateDeviceRule(offer, context) {
    const { deviceInfo } = context;

    if (offer.device_targeting_json) {
      const deviceTargeting = typeof offer.device_targeting_json === 'string'
        ? JSON.parse(offer.device_targeting_json)
        : offer.device_targeting_json;

      if (deviceTargeting.allowed && Array.isArray(deviceTargeting.allowed)) {
        if (!deviceTargeting.allowed.includes(deviceInfo.deviceType)) {
          return {
            passed: false,
            reason: `Device type ${deviceInfo.deviceType} not allowed`,
            details: { deviceType: deviceInfo.deviceType, allowed: deviceTargeting.allowed },
          };
        }
      }

      if (deviceTargeting.blocked && Array.isArray(deviceTargeting.blocked)) {
        if (deviceTargeting.blocked.includes(deviceInfo.deviceType)) {
          return {
            passed: false,
            reason: `Device type ${deviceInfo.deviceType} is blocked`,
            details: { deviceType: deviceInfo.deviceType, blocked: deviceTargeting.blocked },
          };
        }
      }
    }

    return { passed: true, reason: 'Device targeting passed' };
  }

  /**
   * Evaluate OS targeting
   */
  async evaluateOSRule(offer, context) {
    const { deviceInfo } = context;

    if (offer.os_targeting_json) {
      const osTargeting = typeof offer.os_targeting_json === 'string'
        ? JSON.parse(offer.os_targeting_json)
        : offer.os_targeting_json;

      if (osTargeting.allowed && Array.isArray(osTargeting.allowed)) {
        if (!osTargeting.allowed.includes(deviceInfo.os)) {
          return {
            passed: false,
            reason: `OS ${deviceInfo.os} not allowed`,
            details: { os: deviceInfo.os, allowed: osTargeting.allowed },
          };
        }
      }

      if (osTargeting.blocked && Array.isArray(osTargeting.blocked)) {
        if (osTargeting.blocked.includes(deviceInfo.os)) {
          return {
            passed: false,
            reason: `OS ${deviceInfo.os} is blocked`,
            details: { os: deviceInfo.os, blocked: osTargeting.blocked },
          };
        }
      }
    }

    return { passed: true, reason: 'OS targeting passed' };
  }

  /**
   * Evaluate browser targeting
   */
  async evaluateBrowserRule(offer, context) {
    const { deviceInfo } = context;

    if (offer.browser_targeting_json) {
      const browserTargeting = typeof offer.browser_targeting_json === 'string'
        ? JSON.parse(offer.browser_targeting_json)
        : offer.browser_targeting_json;

      if (browserTargeting.allowed && Array.isArray(browserTargeting.allowed)) {
        if (!browserTargeting.allowed.includes(deviceInfo.browser)) {
          return {
            passed: false,
            reason: `Browser ${deviceInfo.browser} not allowed`,
            details: { browser: deviceInfo.browser, allowed: browserTargeting.allowed },
          };
        }
      }

      if (browserTargeting.blocked && Array.isArray(browserTargeting.blocked)) {
        if (browserTargeting.blocked.includes(deviceInfo.browser)) {
          return {
            passed: false,
            reason: `Browser ${deviceInfo.browser} is blocked`,
            details: { browser: deviceInfo.browser, blocked: browserTargeting.blocked },
          };
        }
      }
    }

    return { passed: true, reason: 'Browser targeting passed' };
  }

  /**
   * Evaluate connection type (wifi/mobile)
   */
  async evaluateConnectionRule(offer, context) {
    // Would need connection type from request headers or IP lookup
    // Simplified for now - can be enhanced
    return { passed: true, reason: 'Connection targeting passed' };
  }

  /**
   * Evaluate carrier targeting
   */
  async evaluateCarrierRule(offer, context) {
    // Would need carrier from IP lookup or headers
    // Simplified for now
    return { passed: true, reason: 'Carrier targeting passed' };
  }

  /**
   * Evaluate schedule (time-based) targeting
   */
  async evaluateScheduleRule(offer, context) {
    const now = new Date();
    const currentDay = now.getDay(); // 0-6
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM

    // Check offer-level schedule
    if (offer.start_time && offer.end_time) {
      if (currentTime < offer.start_time || currentTime > offer.end_time) {
        return {
          passed: false,
          reason: `Current time ${currentTime} outside offer schedule (${offer.start_time}-${offer.end_time})`,
          details: { currentTime, startTime: offer.start_time, endTime: offer.end_time },
        };
      }
    }

    // Check schedule rules
    const [scheduleRows] = await pool.query(
      `SELECT * FROM offer_schedules 
       WHERE offer_id = ? AND is_active = 1 
       AND (day_of_week IS NULL OR day_of_week = ?)`,
      [offer.id, currentDay]
    );
    const schedules = Array.isArray(scheduleRows) ? scheduleRows : [];

    if (schedules.length > 0) {
      const activeSchedule = schedules.find(s => {
        const start = s.start_time.substring(0, 5);
        const end = s.end_time.substring(0, 5);
        return currentTime >= start && currentTime <= end;
      });

      if (!activeSchedule) {
        return {
          passed: false,
          reason: `Current time ${currentTime} not within any active schedule`,
          details: { currentTime, schedules },
        };
      }
    }

    return { passed: true, reason: 'Schedule targeting passed' };
  }

  /**
   * Evaluate IP whitelist/blacklist
   */
  async evaluateIPRule(offer, publisherId, context) {
    const { ip } = context;

    // Check offer-level IP action
    if (offer.ip_action === 'whitelist' && offer.ip_list) {
      const allowedIPs = offer.ip_list.split(',').map(i => i.trim());
      if (!allowedIPs.includes(ip)) {
        return {
          passed: false,
          reason: `IP ${ip} not in whitelist`,
          details: { ip, action: 'whitelist' },
        };
      }
    }

    if (offer.ip_action === 'blacklist' && offer.ip_list) {
      const blockedIPs = offer.ip_list.split(',').map(i => i.trim());
      if (blockedIPs.includes(ip)) {
        return {
          passed: false,
          reason: `IP ${ip} is blacklisted`,
          details: { ip, action: 'blacklist' },
        };
      }
    }

    return { passed: true, reason: 'IP targeting passed' };
  }

  /**
   * Evaluate publisher-specific targeting
   */
  async evaluatePublisherRule(offer, publisherId, context) {
    // Check publisher-specific overrides
    const [overrideRows] = await pool.query(
      `SELECT * FROM publisher_targeting_overrides 
       WHERE publisher_id = ? AND (offer_id = ? OR offer_id IS NULL) AND is_active = 1
       ORDER BY offer_id DESC LIMIT 1`,
      [publisherId, offer.id]
    );
    const override = Array.isArray(overrideRows) ? overrideRows[0] : overrideRows;

    if (override) {
      // Device blocking
      if (override.device_blocked) {
        const blocked = typeof override.device_blocked === 'string' ? JSON.parse(override.device_blocked) : override.device_blocked;
        if (Array.isArray(blocked) && blocked.includes(context.deviceInfo.deviceType)) {
          return {
            passed: false,
            reason: `Device type ${context.deviceInfo.deviceType} blocked for this publisher`,
            details: { deviceType: context.deviceInfo.deviceType, override: 'publisher_blocked' },
          };
        }
      }
    }

    return { passed: true, reason: 'Publisher targeting passed' };
  }

  /**
   * Log rule evaluation
   */
  async logRuleEvaluation(clickId, offerId, publisherId, ruleType, result, details) {
    try {
      await pool.query(
        `INSERT INTO targeting_rule_logs (
          click_id, offer_id, publisher_id, rule_type, rule_result, rule_details, evaluated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [clickId, offerId, publisherId, ruleType, result, JSON.stringify(details || {})]
      );
    } catch (error) {
      logger.error('OfferTargetingService.logRuleEvaluation error:', error);
    }
  }
}

export default new OfferTargetingService();
