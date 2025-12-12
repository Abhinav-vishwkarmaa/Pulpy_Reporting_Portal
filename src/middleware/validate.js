/**
 * Validation middleware using Joi
 */

export function validate(schema) {
  return async (request, reply) => {
    try {
      // Determine what to validate based on request method
      let dataToValidate;
      if (request.method === 'GET') {
        dataToValidate = request.query;
      } else {
        dataToValidate = request.body;
      }

      // Validate the data
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
        }));

        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed. Please check the details below.',
          details: validationErrors,
          timestamp: new Date().toISOString(),
        });
      }

      // Replace the original data with validated and sanitized data
      if (request.method === 'GET') {
        request.query = value;
      } else {
        request.body = value;
      }
    } catch (err) {
      return reply.code(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Validation error occurred',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

