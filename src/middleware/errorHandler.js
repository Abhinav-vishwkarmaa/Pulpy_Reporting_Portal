import logger from '../utils/logger.js';

export async function errorHandler(error, request, reply) {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = request.url;
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  
  // Format and log error details with clear formatting
  console.log('\n' + '='.repeat(80));
  console.log(`❌ ERROR HANDLED [${timestamp}]`);
  console.log(`   Request: ${method} ${url}`);
  console.log(`   IP: ${ip}`);
  console.log(`   Error Type: ${error.constructor.name}`);
  console.log(`   ┌─ Error Details ────────────────────────────────────────────────────`);
  
  // Validation errors
  if (error.validation) {
    const validationErrors = error.validation.map(err => ({
      field: err.instancePath || err.params?.key || err.params?.label || 'unknown',
      message: err.message,
      value: err.params?.value,
    }));
    
    console.log(`   │ Type: Validation Error`);
    console.log(`   │ Message: Request validation failed`);
    console.log(`   │ Validation Issues:`);
    validationErrors.forEach((err, index) => {
      console.log(`   │   ${index + 1}. Field: "${err.field}"`);
      console.log(`   │      → ${err.message}`);
      if (err.value !== undefined) {
        console.log(`   │      Value: ${JSON.stringify(err.value)}`);
      }
    });
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(400).send({
      success: false,
      error: 'Validation Error',
      message: 'Request validation failed. Please check the details below.',
      details: validationErrors,
      timestamp,
    });
  }
  
  // Database errors
  if (error.code === '23505') { // Unique violation
    console.log(`   │ Type: Database Error - Unique Constraint Violation`);
    console.log(`   │ Message: Resource already exists`);
    console.log(`   │ Database Code: ${error.code}`);
    if (error.detail) {
      console.log(`   │ Detail: ${error.detail}`);
    }
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(409).send({
      success: false,
      error: 'Conflict',
      message: 'A resource with this information already exists',
      timestamp,
    });
  }
  
  if (error.code === '23503') { // Foreign key violation
    console.log(`   │ Type: Database Error - Foreign Key Constraint Violation`);
    console.log(`   │ Message: Referenced resource does not exist`);
    console.log(`   │ Database Code: ${error.code}`);
    if (error.detail) {
      console.log(`   │ Detail: ${error.detail}`);
    }
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(400).send({
      success: false,
      error: 'Bad Request',
      message: 'Referenced resource does not exist. Please check the provided IDs.',
      timestamp,
    });
  }
  
  if (error.code === '23502') { // Not null violation
    console.log(`   │ Type: Database Error - Not Null Constraint Violation`);
    console.log(`   │ Message: Required field is missing`);
    console.log(`   │ Database Code: ${error.code}`);
    if (error.column) {
      console.log(`   │ Column: ${error.column}`);
    }
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(400).send({
      success: false,
      error: 'Bad Request',
      message: 'Required field is missing',
      timestamp,
    });
  }
  
  // JWT/Auth errors
  if (error.statusCode === 401) {
    console.log(`   │ Type: Authentication Error`);
    console.log(`   │ Message: ${error.message || 'Authentication required'}`);
    console.log(`   │ Status: Unauthorized access attempt`);
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(401).send({
      success: false,
      error: 'Unauthorized',
      message: error.message || 'Authentication required. Please provide valid credentials.',
      timestamp,
    });
  }
  
  // Not found errors
  if (error.statusCode === 404) {
    console.log(`   │ Type: Not Found Error`);
    console.log(`   │ Message: ${error.message || 'Resource does not exist'}`);
    console.log(`   │ Path: ${url}`);
    console.log(`   └────────────────────────────────────────────────────────────────────`);
    console.log('='.repeat(80) + '\n');
    
    return reply.code(404).send({
      success: false,
      error: 'Not Found',
      message: error.message || 'The requested resource was not found',
      path: url,
      timestamp,
    });
  }
  
  // Default error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  console.log(`   │ Type: ${statusCode >= 500 ? 'Server Error' : 'Client Error'}`);
  console.log(`   │ Message: ${message}`);
  console.log(`   │ Status Code: ${statusCode}`);
  
  if (error.stack && process.env.NODE_ENV !== 'production') {
    console.log(`   │ Stack Trace:`);
    const stackLines = error.stack.split('\n').slice(0, 5);
    stackLines.forEach(line => {
      console.log(`   │   ${line.trim()}`);
    });
  }
  
  if (error.code) {
    console.log(`   │ Error Code: ${error.code}`);
  }
  
  console.log(`   └────────────────────────────────────────────────────────────────────`);
  console.log('='.repeat(80) + '\n');
  
  return reply.code(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal Server Error' : 'Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred while processing your request. Please try again later.' 
      : message,
    ...(process.env.NODE_ENV !== 'production' && error.stack ? {
      stack: error.stack.split('\n').slice(0, 5),
    } : {}),
    timestamp,
  });
}

