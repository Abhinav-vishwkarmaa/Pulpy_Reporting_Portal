import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class AuthController {
  async register(request, reply) {
    try {
      const { email, name, password, role = 'admin' } = request.body;

      // Validate input
      if (!email || !name || !password) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Email, name, and password are required',
        });
      }

      if (password.length < 6) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Password must be at least 6 characters long',
        });
      }

      // Check if admin already exists
      const [existingRows] = await pool.query(
        'SELECT id FROM admin_users WHERE email = ?',
        [email]
      );

      if (existingRows && existingRows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Admin with this email already exists',
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create admin user
      const [result] = await pool.query(
        'INSERT INTO admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
        [email, name, passwordHash, role]
      );

      const adminId = result.insertId || result[0]?.insertId;

      // Generate JWT token
      const token = jwt.sign(
        { id: adminId, email, name, role },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return reply.code(201).send({
        success: true,
        message: 'Admin registered successfully',
        data: {
          id: adminId,
          email,
          name,
          role,
          token,
        },
      });
    } catch (error) {
      logger.error('AuthController.register error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async login(request, reply) {
    try {
      const { email, password } = request.body;

      // Validate input
      if (!email || !password) {
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Email and password are required',
        });
      }

      // Find admin user
      const [rows] = await pool.query(
        'SELECT id, email, name, password_hash, role FROM admin_users WHERE email = ?',
        [email]
      );

      if (!rows || rows.length === 0) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      const admin = Array.isArray(rows) ? rows[0] : rows;

      // Verify password
      const isValid = await bcrypt.compare(password, admin.password_hash);

      if (!isValid) {
        return reply.code(401).send({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid email or password',
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return reply.send({
        success: true,
        message: 'Login successful',
        data: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          token,
        },
      });
    } catch (error) {
      logger.error('AuthController.login error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getProfile(request, reply) {
    try {
      // Admin info is already attached by auth middleware
      return reply.send({
        success: true,
        data: request.admin,
      });
    } catch (error) {
      logger.error('AuthController.getProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AuthController();

