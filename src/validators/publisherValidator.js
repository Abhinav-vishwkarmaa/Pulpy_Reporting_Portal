import Joi from 'joi';

export const createPublisherSchema = Joi.object({
  email: Joi.string().email().required(),
  first_name: Joi.string().allow('', null).optional(),
  company_name: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  password: Joi.string().min(6).required(),
  global_postback_url: Joi.string().allow('', null).custom((value, helpers) => {
    // If empty or null, allow it
    if (!value || value === '') {
      return value;
    }
    // If value exists, validate as URI
    try {
      new URL(value);
      return value;
    } catch (e) {
      return helpers.error('string.uri');
    }
  }).optional(),
});

export const updatePublisherSchema = Joi.object({
  email: Joi.string().email().optional(),
  first_name: Joi.string().allow('', null).optional(),
  company_name: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  password: Joi.string().min(6).optional(),
  global_postback_url: Joi.string().allow('', null).custom((value, helpers) => {
    // If empty or null, allow it
    if (!value || value === '') {
      return value;
    }
    // If value exists, validate as URI
    try {
      new URL(value);
      return value;
    } catch (e) {
      return helpers.error('string.uri');
    }
  }).optional(),
  status: Joi.string().valid('pending', 'active', 'suspended').optional(),
});

