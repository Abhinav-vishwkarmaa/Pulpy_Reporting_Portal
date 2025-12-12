import Joi from 'joi';

export const reportQuerySchema = Joi.object({
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  offer_id: Joi.number().integer().positive().optional(),
  publisher_id: Joi.number().integer().positive().optional(),
  country: Joi.string().optional(),
  ip: Joi.string().ip().optional(),
  tid: Joi.string().optional(),
  rcid: Joi.string().optional(),
  device_brand: Joi.string().optional(),
  os: Joi.string().optional(),
  browser: Joi.string().optional(),
  referrer: Joi.string().optional(),
  source_id: Joi.string().optional(),
  google_id: Joi.string().optional(),
  android_id: Joi.string().optional(),
  hour: Joi.number().integer().min(0).max(23).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

