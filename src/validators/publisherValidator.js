import Joi from 'joi';

export const createPublisherSchema = Joi.object({
  email: Joi.string().email().required(),
  mobile: Joi.string().allow('', null).optional(),
  first_name: Joi.string().allow('', null).optional(),
  last_name: Joi.string().allow('', null).optional(),
  company_name: Joi.string().allow('', null).optional(),
  position: Joi.string().allow('', null).optional(),
  address: Joi.string().allow('', null).optional(),
  state: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  zip_code: Joi.string().allow('', null).optional(),
  tax_invoice_details: Joi.object().allow(null).optional(),
  payment_terms: Joi.object().allow(null).optional(),
  global_postback_url: Joi.string().uri().allow('', null).optional(),
  status: Joi.string().valid('pending', 'active', 'suspended').default('pending'),
});

export const updatePublisherSchema = Joi.object({
  email: Joi.string().email().optional(),
  mobile: Joi.string().allow('', null).optional(),
  first_name: Joi.string().allow('', null).optional(),
  last_name: Joi.string().allow('', null).optional(),
  company_name: Joi.string().allow('', null).optional(),
  position: Joi.string().allow('', null).optional(),
  address: Joi.string().allow('', null).optional(),
  state: Joi.string().allow('', null).optional(),
  country: Joi.string().allow('', null).optional(),
  zip_code: Joi.string().allow('', null).optional(),
  tax_invoice_details: Joi.object().allow(null).optional(),
  payment_terms: Joi.object().allow(null).optional(),
  global_postback_url: Joi.string().uri().allow('', null).optional(),
  status: Joi.string().valid('pending', 'active', 'suspended').optional(),
});

