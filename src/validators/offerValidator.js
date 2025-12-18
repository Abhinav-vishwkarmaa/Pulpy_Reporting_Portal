import Joi from 'joi';

export const createOfferSchema = Joi.object({
  name: Joi.string().required(),
  category: Joi.string().valid('CPA', 'CPI', 'CPM').required(),
  advertiser_revenue: Joi.number().positive().required(),
  affiliate_model_cost: Joi.number().positive().required(),
  start_at: Joi.date().iso().allow(null).optional(),
  end_at: Joi.date().iso().allow(null).optional(),
  offer_url: Joi.string().required(),
  preview_url: Joi.string().allow('', null).custom((value, helpers) => {
    // If empty or null, allow it
    if (!value || value === '') {
      return value;
    }
    // Validate URL format but allow fragments (#) and macros ({})
    try {
      // Try to parse as URL - this will validate the base URL structure
      // but we'll be lenient about fragments and query parameters
      const url = new URL(value.split('#')[0]); // Validate base URL before fragment
      return value; // Return original value to preserve fragment and macros
    } catch (e) {
      // If URL parsing fails, check if it's at least a reasonable URL-like string
      if (value.match(/^https?:\/\//i)) {
        return value; // Allow if it starts with http:// or https://
      }
      return helpers.error('string.uri');
    }
  }).optional(),
  capping_per_day: Joi.number().integer().min(0).default(0),
  fallback_url: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('pending', 'active', 'deactivate', 'remove').default('pending'),
});

export const updateOfferStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'active', 'deactivate', 'remove').required(),
});

export const updateOfferSchema = Joi.object({
  name: Joi.string().optional(),
  category: Joi.string().valid('CPA', 'CPI', 'CPM').optional(),
  advertiser_revenue: Joi.number().positive().optional(),
  affiliate_model_cost: Joi.number().positive().optional(),
  start_at: Joi.date().iso().allow(null).optional(),
  end_at: Joi.date().iso().allow(null).optional(),
  offer_url: Joi.string().optional(),
  preview_url: Joi.string().allow('', null).custom((value, helpers) => {
    // If empty or null, allow it
    if (!value || value === '') {
      return value;
    }
    // Validate URL format but allow fragments (#) and macros ({})
    try {
      // Try to parse as URL - this will validate the base URL structure
      // but we'll be lenient about fragments and query parameters
      const url = new URL(value.split('#')[0]); // Validate base URL before fragment
      return value; // Return original value to preserve fragment and macros
    } catch (e) {
      // If URL parsing fails, check if it's at least a reasonable URL-like string
      if (value.match(/^https?:\/\//i)) {
        return value; // Allow if it starts with http:// or https://
      }
      return helpers.error('string.uri');
    }
  }).optional(),
  capping_per_day: Joi.number().integer().min(0).optional(),
  fallback_url: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('pending', 'active', 'deactivate', 'remove').optional(),
});

