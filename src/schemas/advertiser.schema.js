export const advertiserIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
};

export const listAdvertisersQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['active', 'inactive'] },
    country: { type: 'string', minLength: 2, maxLength: 100 },
    search: { type: 'string', maxLength: 150 },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};

export const createAdvertiserSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'email', 'country'],
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 150 },
    email: { type: 'string', format: 'email', maxLength: 150 },
    country: { type: 'string', minLength: 2, maxLength: 100 },
    company_name: { type: ['string', 'null'], maxLength: 150 },
    website: { type: ['string', 'null'], maxLength: 255 },
    notes: { type: ['string', 'null'], maxLength: 2000 },
    status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
  },
};

export const updateAdvertiserSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 150 },
    email: { type: 'string', format: 'email', maxLength: 150 },
    country: { type: 'string', minLength: 2, maxLength: 100 },
    company_name: { type: ['string', 'null'], maxLength: 150 },
    website: { type: ['string', 'null'], maxLength: 255 },
    notes: { type: ['string', 'null'], maxLength: 2000 },
    status: { type: 'string', enum: ['active', 'inactive'] },
  },
};


