import Joi from 'joi';

// Schema for capping budget/conversions objects
const cappingSchema = Joi.object({
  duration: Joi.string().valid('hour', 'day', 'week', 'month').required(),
  amount: Joi.number().min(0).required(),
});

// Helper function to validate URL has required macros
const validateUrlMacros = (value, helpers, urlType) => {
  if (!value || value === '') {
    return value;
  }
  
  // Validate as URI
  try {
    new URL(value);
  } catch (e) {
    return helpers.error('string.uri');
  }
  
  // Check for required macros: {click_id}, {CLICK_ID}, {rcid}, or {RCID}
  const hasClickIdMacro = /{click_id}/i.test(value);
  const hasRcidMacro = /{rcid}/i.test(value);
  
  if (!hasClickIdMacro && !hasRcidMacro) {
    return helpers.error('any.custom', {
      message: `${urlType} must contain {click_id} or {rcid} macro`,
    });
  }
  
  return value;
};

// Schema for individual publisher assignment
const publisherAssignmentSchema = Joi.object({
  publisher_id: Joi.number().integer().positive().required(),
  payout_override: Joi.number().positive().allow(null).optional(),
  conversion_approval_percentage: Joi.number().min(0).max(100).allow(null).optional(),
  capping_budget: cappingSchema.allow(null).optional(),
  capping_conversions: cappingSchema.allow(null).optional(),
  callback_url: Joi.string().allow('', null).custom((value, helpers) => {
    return validateUrlMacros(value, helpers, 'callback_url');
  }).optional(),
  destination_url: Joi.string().allow('', null).custom((value, helpers) => {
    return validateUrlMacros(value, helpers, 'destination_url');
  }).optional(),
  offer_url: Joi.string().allow('', null).custom((value, helpers) => {
    // Legacy field name support - same validation as destination_url
    return validateUrlMacros(value, helpers, 'destination_url');
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

// Schema for updating an assignment
export const updateAssignmentSchema = Joi.object({
  payout_override: Joi.number().positive().allow(null).optional(),
  conversion_approval_percentage: Joi.number().min(0).max(100).allow(null).optional(),
  capping_budget: cappingSchema.allow(null).optional(),
  capping_conversions: cappingSchema.allow(null).optional(),
  callback_url: Joi.string().allow('', null).custom((value, helpers) => {
    return validateUrlMacros(value, helpers, 'callback_url');
  }).optional(),
  destination_url: Joi.string().allow('', null).custom((value, helpers) => {
    return validateUrlMacros(value, helpers, 'destination_url');
  }).optional(),
  offer_url: Joi.string().allow('', null).custom((value, helpers) => {
    // Legacy field name support - same validation as destination_url
    return validateUrlMacros(value, helpers, 'destination_url');
  }).optional(),
  notes: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
});

