/**
 * Utility function to create consistent error responses
 */
export function createErrorResponse(error, statusCode = 500, customMessage = null) {
  const timestamp = new Date().toISOString();
  
  return {
    success: false,
    error: error.name || 'Error',
    message: customMessage || error.message || 'An error occurred',
    ...(process.env.NODE_ENV !== 'production' && error.stack ? {
      stack: error.stack.split('\n').slice(0, 3),
    } : {}),
    timestamp,
  };
}

export function createSuccessResponse(data, message = null) {
  return {
    success: true,
    ...(message && { message }),
    data,
  };
}

