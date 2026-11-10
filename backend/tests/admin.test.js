import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAdmin } from '../src/middleware/admin.js';
import { createAdminRouter } from '../src/routes/adminRoutes.js';
import * as adminController from '../src/controllers/adminController.js';

describe('Admin Module - Backend Unit & Router Tests (Phần 3)', () => {
  describe('1. Middleware requireAdmin', () => {
    it('Chặn truy cập nếu req.user không tồn tại (403 FORBIDDEN)', () => {
      const req = {};
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'FORBIDDEN'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('Chặn truy cập nếu req.user có role là "viewer" hoặc "member"', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      requireAdmin({ user: { role: 'viewer' } }, res, next);
      expect(res.status).toHaveBeenCalledWith(403);

      requireAdmin({ user: { role: 'member' } }, res, next);
      expect(res.status).toHaveBeenCalledWith(403);

      expect(next).not.toHaveBeenCalled();
    });

    it('Cho phép đi tiếp (next) nếu req.user có role là "admin"', () => {
      const req = { user: { role: 'admin', email: 'admin@smarthome.local' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('2. Router /api/admin & Middleware Chain', () => {
    it('Chặn toàn bộ route admin khi người dùng không phải Admin', async () => {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, res, next) => {
        req.user = { id: 'usr-guest', role: 'viewer' };
        next();
      };

      app.use('/api/admin', createAdminRouter({ requireAuth: mockAuth }));

      const resUsers = await request(app).get('/api/admin/users');
      expect(resUsers.status).toBe(403);
      expect(resUsers.body.code).toBe('FORBIDDEN');

      const resStatus = await request(app).get('/api/admin/system-status');
      expect(resStatus.status).toBe(403);

      const resLogs = await request(app).get('/api/admin/audit-logs');
      expect(resLogs.status).toBe(403);
    });

    it('Cho phép Admin gọi GET /api/admin/system-status', async () => {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, res, next) => {
        req.user = { id: 'usr-admin', role: 'admin', email: 'admin@smarthome.local' };
        next();
      };

      app.use('/api/admin', createAdminRouter({ requireAuth: mockAuth }));

      const res = await request(app).get('/api/admin/system-status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.server).toBeDefined();
      expect(res.body.data.server.port).toBe(5000);
      expect(res.body.data.devices.list.length).toBe(5);
    });

    it('Cho phép Admin gọi GET /api/admin/audit-logs với bộ lọc', async () => {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, res, next) => {
        req.user = { id: 'usr-admin', role: 'admin', email: 'admin@smarthome.local' };
        next();
      };

      app.use('/api/admin', createAdminRouter({ requireAuth: mockAuth }));

      const res = await request(app).get('/api/admin/audit-logs?category=auth');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('Từ chối PATCH /api/admin/users/:userId/role với userId không hợp lệ (400 INVALID_USER_ID)', async () => {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, res, next) => {
        req.user = { _id: '507f191e810c19729de860ea', role: 'admin' };
        next();
      };

      app.use('/api/admin', createAdminRouter({
        requireAuth: mockAuth,
        verifyOrigin: (req, res, next) => next(),
        requireJsonContentType: (req, res, next) => next()
      }));

      const res = await request(app)
        .patch('/api/admin/users/invalid-id/role')
        .send({ role: 'member' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_USER_ID');
    });

    it('Từ chối POST /api/admin/users khi thiếu trường bắt buộc (400 VALIDATION_ERROR)', async () => {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, res, next) => {
        req.user = { _id: '507f191e810c19729de860ea', role: 'admin' };
        next();
      };

      app.use('/api/admin', createAdminRouter({
        requireAuth: mockAuth,
        verifyOrigin: (req, res, next) => next(),
        requireJsonContentType: (req, res, next) => next()
      }));

      const res = await request(app)
        .post('/api/admin/users')
        .send({ name: 'A', email: 'invalid-email', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.name).toBeDefined();
      expect(res.body.errors.email).toBeDefined();
      expect(res.body.errors.password).toBeDefined();
    });
  });
});
