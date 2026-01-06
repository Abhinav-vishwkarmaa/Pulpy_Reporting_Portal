import Joi from 'joi';

export const clickQuerySchema = Joi.object({
  offer_id: Joi.string().required(),
  pub_id: Joi.string().required(),
  tid: Joi.string().allow('', null).optional(),
  rcid: Joi.string().allow('', null).optional(),
  source_id: Joi.string().allow('', null).optional(),
  device_id: Joi.string().allow('', null).optional(),
  google_id: Joi.string().allow('', null).optional(),
  android_id: Joi.string().allow('', null).optional(),
});

export const impressionQuerySchema = Joi.object({
  offer_id: Joi.string().required(),
  pub_id: Joi.string().required(),
});

export const postbackQuerySchema = Joi.object({
  click_id: Joi.string().allow('', null).optional(),
  rcid: Joi.string().allow('', null).optional(),
  amount: Joi.number().positive().optional(),
  status: Joi.string().valid('approved', 'rejected', 'pending').default('approved'),
});

export const testConversionSchema = Joi.object({
  affiliate_url: Joi.string().required(),
  click_id: Joi.string().allow('', null).optional(),
});

export const testAffiliatePostbackSchema = Joi.object({
  publisher_id: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
  affiliate_click_id: Joi.string().required(),
  status: Joi.string().valid('approved', 'rejected', 'pending').default('approved'),
  payout: Joi.number().optional(),
  amount: Joi.number().optional(),
});

