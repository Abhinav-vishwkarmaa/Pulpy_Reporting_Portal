import Joi from 'joi';

export const createAssignmentSchema = Joi.object({
  publisher_id: Joi.number().integer().positive().required(),
  offer_id: Joi.number().integer().positive().required(),
  payout_override: Joi.number().positive().allow(null).optional(),
  cap_override: Joi.number().integer().min(0).allow(null).optional(),
  notes: Joi.string().allow('', null).optional(),
});

