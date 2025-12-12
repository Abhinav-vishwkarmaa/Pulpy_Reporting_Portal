import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';

/**
 * JWT authentication middleware
 */
export async function authenticateAdmin(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header. Please provide a Bearer token.',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Token is required',
      });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );
    
    // Get admin info from database
    const [rows] = await pool.query(
      'SELECT id, email, name, role FROM admin_users WHERE id = ? AND email = ?',
      [decoded.id, decoded.email]
    );
    
    if (!rows || rows.length === 0) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token or user not found',
      });
    }
    
    const admin = rows[0];
    
    // Attach admin info to request
    request.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Token has expired. Please login again.',
      });
    }
    
    logger.error('Auth error:', error);
    return reply.code(500).send({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

