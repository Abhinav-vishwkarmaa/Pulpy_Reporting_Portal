import Joi from 'joi';

export const createOfferSchema = Joi.object({
  name: Joi.string().required(),
  category: Joi.string().valid('CPA', 'CPI', 'CPM').required(),
  advertiser_revenue: Joi.number().positive().required(),
  affiliate_model_cost: Joi.number().positive().required(),
  start_at: Joi.date().iso().allow(null).optional(),
  end_at: Joi.date().iso().allow(null).optional(),
  offer_url: Joi.string().uri().required(),
  capping_per_day: Joi.number().integer().min(0).default(0),
  fallback_url: Joi.string().uri().allow('', null).optional(),
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
  offer_url: Joi.string().uri().optional(),
  capping_per_day: Joi.number().integer().min(0).optional(),
  fallback_url: Joi.string().uri().allow('', null).optional(),
  status: Joi.string().valid('pending', 'active', 'deactivate', 'remove').optional(),
});

