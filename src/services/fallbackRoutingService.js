import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerService from './offerService.js';

export class FallbackRoutingService {
  /**
   * Get fallback URL for an offer
   * Returns the best fallback offer URL based on rules
   */
  async getFallbackURL(offerId, publisherId, context = {}) {
    try {
      const { country, deviceType, ip } = context;

      // Get fallback chains for this offer
      const [chainRows] = await pool.query(
        `SELECT * FROM fallback_chains 
         WHERE offer_id = ? AND is_active = 1 
         ORDER BY priority ASC`,
        [offerId]
      );
      const chains = Array.isArray(chainRows) ? chainRows : [];

      if (chains.length === 0) {
        // Use simple fallback from offer table
        const offer = await offerService.findById(offerId);
        if (offer?.fallback_url) return offer.fallback_url;
        if (offer?.fallback_offer_id) {
          const fallbackOffer = await offerService.findById(offer.fallback_offer_id);
          return fallbackOffer?.offer_url || null;
        }
        return null;
      }

      // Process each chain until we find a valid fallback
      for (const chain of chains) {
        const fallbackURL = await this.evaluateChain(chain.id, publisherId, context);
        if (fallbackURL) {
          return fallbackURL;
        }
      }

      return null;
    } catch (error) {
      logger.error('FallbackRoutingService.getFallbackURL error:', error);
      return null;
    }
  }

  /**
   * Evaluate a fallback chain
   */
  async evaluateChain(chainId, publisherId, context) {
    try {
      const { country, deviceType } = context;

      // Get chain items ordered by position
      const [itemRows] = await pool.query(
        `SELECT * FROM fallback_chain_items 
         WHERE chain_id = ? AND is_active = 1 
         ORDER BY position ASC`,
        [chainId]
      );
      const items = Array.isArray(itemRows) ? itemRows : [];

      if (items.length === 0) return null;

      // Check if weighted distribution is needed
      const totalWeight = items.reduce((sum, item) => sum + (item.weight || 100), 0);
      if (totalWeight > 100) {
        // Weighted distribution
        return await this.selectWeightedOffer(items, publisherId, context);
      }

      // Sequential fallback - try each offer in order
      for (const item of items) {
        if (await this.checkItemConditions(item, publisherId, context)) {
          const offer = await offerService.findById(item.offer_id);
          if (offer && offer.status === 'live') {
            return offer.offer_url;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('FallbackRoutingService.evaluateChain error:', error);
      return null;
    }
  }

  /**
   * Check if fallback item conditions are met
   */
  async checkItemConditions(item, publisherId, context) {
    const { country, deviceType } = context;

    // Check geo restrictions
    if (item.geo_restrictions) {
      const geoRestrictions = typeof item.geo_restrictions === 'string'
        ? JSON.parse(item.geo_restrictions)
        : item.geo_restrictions;

      if (geoRestrictions.allowed && Array.isArray(geoRestrictions.allowed)) {
        if (!geoRestrictions.allowed.includes(country)) {
          return false;
        }
      }

      if (geoRestrictions.blocked && Array.isArray(geoRestrictions.blocked)) {
        if (geoRestrictions.blocked.includes(country)) {
          return false;
        }
      }
    }

    // Check publisher restrictions
    if (item.publisher_restrictions) {
      const pubRestrictions = typeof item.publisher_restrictions === 'string'
        ? JSON.parse(item.publisher_restrictions)
        : item.publisher_restrictions;

      if (pubRestrictions.allowed && Array.isArray(pubRestrictions.allowed)) {
        if (!pubRestrictions.allowed.includes(publisherId)) {
          return false;
        }
      }

      if (pubRestrictions.blocked && Array.isArray(pubRestrictions.blocked)) {
        if (pubRestrictions.blocked.includes(publisherId)) {
          return false;
        }
      }
    }

    // Check additional conditions
    if (item.conditions) {
      const conditions = typeof item.conditions === 'string'
        ? JSON.parse(item.conditions)
        : item.conditions;

      if (conditions.device_types && Array.isArray(conditions.device_types)) {
        if (!conditions.device_types.includes(deviceType)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Select offer using weighted distribution
   */
  async selectWeightedOffer(items, publisherId, context) {
    try {
      // Filter items that meet conditions
      const validItems = [];
      for (const item of items) {
        if (await this.checkItemConditions(item, publisherId, context)) {
          const offer = await offerService.findById(item.offer_id);
          if (offer && offer.status === 'live') {
            validItems.push(item);
          }
        }
      }

      if (validItems.length === 0) return null;

      // Calculate weighted random selection
      const totalWeight = validItems.reduce((sum, item) => sum + (item.weight || 100), 0);
      let random = Math.random() * totalWeight;

      for (const item of validItems) {
        random -= (item.weight || 100);
        if (random <= 0) {
          const offer = await offerService.findById(item.offer_id);
          return offer?.offer_url || null;
        }
      }

      // Fallback to first valid item
      const firstItem = validItems[0];
      const offer = await offerService.findById(firstItem.offer_id);
      return offer?.offer_url || null;
    } catch (error) {
      logger.error('FallbackRoutingService.selectWeightedOffer error:', error);
      return null;
    }
  }

  /**
   * Log fallback execution
   */
  async logFallbackExecution(clickId, originalOfferId, chainId, selectedOfferId, reason, executionPath) {
    try {
      await pool.query(
        `INSERT INTO fallback_execution_logs (
          click_id, original_offer_id, fallback_chain_id, selected_offer_id,
          selection_reason, execution_path
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [clickId, originalOfferId, chainId, selectedOfferId, reason, JSON.stringify(executionPath || [])]
      );
    } catch (error) {
      logger.error('FallbackRoutingService.logFallbackExecution error:', error);
    }
  }
}

export default new FallbackRoutingService();
