import Joi from 'joi';

// Schema for capping budget/conversions objects
const cappingSchema = Joi.object({
  duration: Joi.string().valid('hour', 'day', 'week', 'month').required(),
  amount: Joi.number().min(0).required(),
});

// Schema for individual publisher assignment
const publisherAssignmentSchema = Joi.object({
  publisher_id: Joi.number().integer().positive().required(),
  payout_override: Joi.number().positive().allow(null).optional(),
  conversion_approval_percentage: Joi.number().min(0).max(100).allow(null).optional(),
  capping_budget: cappingSchema.allow(null).optional(),
  capping_conversions: cappingSchema.allow(null).optional(),
  callback_url: Joi.string().allow('', null).custom((value, helpers) => {
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
  offer_url: Joi.string().allow('', null).custom((value, helpers) => {
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
  notes: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('active', 'inactive', 'suspended').default('active').optional(),
});

// Main schema for multi-publisher assignment
export const createAssignmentSchema = Joi.object({
  offer_id: Joi.number().integer().positive().required(),
  publishers: Joi.array().items(publisherAssignmentSchema).min(1).required(),
});

// Legacy schema for single publisher (backward compatibility)
export const createSingleAssignmentSchema = Joi.object({
  publisher_id: Joi.number().integer().positive().required(),
  offer_id: Joi.number().integer().positive().required(),
  payout_override: Joi.number().positive().allow(null).optional(),
  cap_override: Joi.number().integer().min(0).allow(null).optional(),
  notes: Joi.string().allow('', null).optional(),
});

