const timePattern = '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$';

export const offerIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

export const changeOfferStatusSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['live', 'paused', 'draft'] },
  },
};

export const listOffersQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string' }, // Often used as alias for status or offer type
    status: { type: 'string' }, // loosened from enum to allow flexibility or multiple statuses
    advertiser_id: { type: 'integer', minimum: 1 },
    category: { type: 'string', maxLength: 100 },
    offer_visibility: { type: 'string', maxLength: 50 },
    search: { type: 'string', maxLength: 150 },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 1000, default: 20 },
  },
};

export const createOfferSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'advertiser_id',
    'name',
    'offer_currency',
    'country',
    'advertiser_model',
    'advertiser_amount',
    'affiliate_model',
    'affiliate_amount',
    'offer_url',
  ],
  properties: {
    advertiser_id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 2, maxLength: 150 },
    description: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], maxLength: 100 },
    status: { type: 'string', enum: ['live', 'paused', 'draft'], default: 'draft' },
    offer_visibility: { type: ['string', 'null'], maxLength: 50 },

    offer_currency: { type: 'string', maxLength: 10 },
    country: { type: 'string', maxLength: 100 },

    advertiser_model: { type: 'string', maxLength: 50 },
    advertiser_amount: { type: 'number' },
    affiliate_model: { type: 'string', maxLength: 50 },
    affiliate_amount: { type: 'number' },

    offer_url: { type: 'string', maxLength: 500 },
    preview_url: { type: ['string', 'null'], maxLength: 500 },
    token_type: { type: ['string', 'null'], maxLength: 100 },
    macros_json: { type: ['object', 'null'] },

    start_date: { type: ['string', 'null'], format: 'date' },
    end_date: { type: ['string', 'null'], format: 'date' },
    start_time: { type: ['string', 'null'], pattern: timePattern },
    end_time: { type: ['string', 'null'], pattern: timePattern },

    ip_action: { type: ['string', 'null'], maxLength: 20 },
    ip_list: { type: ['string', 'null'] },
    device_targeting_json: { type: ['object', 'null'] },
    device_action: { type: ['string', 'null'], maxLength: 20 },
    os_targeting_json: { type: ['object', 'null'] },
    os_action: { type: ['string', 'null'], maxLength: 20 },
    browser_targeting_json: { type: ['object', 'null'] },
    browser_action: { type: ['string', 'null'], maxLength: 20 },
    isp_targeting_json: { type: ['object', 'null'] },
    carrier_targeting_json: { type: ['object', 'null'] },
    city_targeting_json: { type: ['object', 'null'] },

    capping_type: { type: 'string', enum: ['none', 'daily', 'monthly', 'weekly'], default: 'none' },
    daily_cap: { type: ['integer', 'null'], minimum: 0 },
    monthly_cap: { type: ['integer', 'null'], minimum: 0 },
    total_cap: { type: ['integer', 'null'], minimum: 0 },
    conversion_cap: { type: ['integer', 'null'], minimum: 0 },
    capping_conversions_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    budget_cap: { type: ['number', 'null'], minimum: 0 },
    advertiser_capping_budget_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    advertiser_capping_budget_amount: { type: ['number', 'null'], minimum: 0 },
    advertiser_over_capping: { type: ['string', 'null'], maxLength: 50 },
    affiliate_over_capping: { type: ['string', 'null'], maxLength: 50 },
    cap_action: { type: ['string', 'null'], enum: ['pause', 'reject', 'alert', 'fallback'] },

    fallback_enabled: { type: ['integer', 'boolean'], enum: [0, 1, true, false] },
    fallback_url: { type: ['string', 'null'], maxLength: 500 },
    fallback_offer_id: { type: ['integer', 'null'], minimum: 1 },

    advertiser_postback_url: { type: ['string', 'null'], maxLength: 500 },
    advertiser_postback_method: { type: ['string', 'null'], maxLength: 10 },
    advertiser_postback_macros_json: { type: ['object', 'null'] },
    system_postback_url: { type: ['string', 'null'], maxLength: 500 },
    system_postback_method: { type: ['string', 'null'], maxLength: 10 },
    system_postback_macros_json: { type: ['object', 'null'] },
  },
};

export const updateOfferSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    advertiser_id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 2, maxLength: 150 },
    description: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], maxLength: 100 },
    status: { type: 'string', enum: ['live', 'paused', 'draft'] },
    offer_visibility: { type: ['string', 'null'], maxLength: 50 },

    offer_currency: { type: 'string', maxLength: 10 },
    country: { type: 'string', maxLength: 100 },

    advertiser_model: { type: 'string', maxLength: 50 },
    advertiser_amount: { type: 'number' },
    affiliate_model: { type: 'string', maxLength: 50 },
    affiliate_amount: { type: 'number' },

    offer_url: { type: 'string', maxLength: 500 },
    preview_url: { type: ['string', 'null'], maxLength: 500 },
    token_type: { type: ['string', 'null'], maxLength: 100 },
    macros_json: { type: ['object', 'null'] },

    start_date: { type: ['string', 'null'], format: 'date' },
    end_date: { type: ['string', 'null'], format: 'date' },
    start_time: { type: ['string', 'null'], pattern: timePattern },
    end_time: { type: ['string', 'null'], pattern: timePattern },

    ip_action: { type: ['string', 'null'], maxLength: 20 },
    ip_list: { type: ['string', 'null'] },
    device_targeting_json: { type: ['object', 'null'] },
    device_action: { type: ['string', 'null'], maxLength: 20 },
    os_targeting_json: { type: ['object', 'null'] },
    os_action: { type: ['string', 'null'], maxLength: 20 },
    browser_targeting_json: { type: ['object', 'null'] },
    browser_action: { type: ['string', 'null'], maxLength: 20 },
    isp_targeting_json: { type: ['object', 'null'] },
    carrier_targeting_json: { type: ['object', 'null'] },
    city_targeting_json: { type: ['object', 'null'] },

    capping_type: { type: 'string', enum: ['none', 'daily', 'monthly', 'weekly'] },
    daily_cap: { type: ['integer', 'null'], minimum: 0 },
    monthly_cap: { type: ['integer', 'null'], minimum: 0 },
    total_cap: { type: ['integer', 'null'], minimum: 0 },
    conversion_cap: { type: ['integer', 'null'], minimum: 0 },
    capping_conversions_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    budget_cap: { type: ['number', 'null'], minimum: 0 },
    advertiser_capping_budget_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    advertiser_capping_budget_amount: { type: ['number', 'null'], minimum: 0 },
    advertiser_over_capping: { type: ['string', 'null'], maxLength: 50 },
    affiliate_over_capping: { type: ['string', 'null'], maxLength: 50 },
    cap_action: { type: ['string', 'null'], enum: ['pause', 'fallback'] },

    fallback_enabled: { type: ['integer', 'boolean'], enum: [0, 1, true, false] },
    fallback_url: { type: ['string', 'null'], maxLength: 500 },
    fallback_offer_id: { type: ['integer', 'null'], minimum: 1 },

    advertiser_postback_url: { type: ['string', 'null'], maxLength: 500 },
    advertiser_postback_method: { type: ['string', 'null'], maxLength: 10 },
    advertiser_postback_macros_json: { type: ['object', 'null'] },
    system_postback_url: { type: ['string', 'null'], maxLength: 500 },
    system_postback_method: { type: ['string', 'null'], maxLength: 10 },
    system_postback_macros_json: { type: ['object', 'null'] },
  },
};

export const assignmentIdParamSchema = {
  type: 'object',
  required: ['assignmentId'],
  properties: {
    assignmentId: { type: 'integer', minimum: 1 },
  },
};

export const updateAssignmentSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    payout_override: { type: ['number', 'null'], minimum: 0 },
    cap_override: { type: ['integer', 'null'], minimum: 0 },
    conversion_approval_percentage: { type: ['number', 'null'], minimum: 0, maximum: 100 },
    capping_budget_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    capping_budget_amount: { type: ['number', 'null'], minimum: 0 },
    capping_conversions_duration: { type: ['string', 'null'], enum: ['daily', 'weekly', 'monthly', 'nocap'] },
    capping_conversions_amount: { type: ['integer', 'null'], minimum: 0 },
    callback_url: { type: ['string', 'null'] },
    offer_url: { type: ['string', 'null'] },
    status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
    notes: { type: ['string', 'null'] },
  },
};


