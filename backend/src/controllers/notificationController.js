import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

/**
 * Lấy danh sách thông báo của người dùng hiện tại (GET /api/notifications).
 *
 * Yêu cầu & Quy tắc:
 * 1. requireAuth: Chỉ truy vấn thông báo thuộc req.user._id.
 * 2. Phân trang ổn định: Sắp xếp theo { createdAt: -1, _id: -1 }.
 * 3. Hỗ trợ query params:
 *    - limit: số nguyên từ 1 đến 50 (mặc định: 20).
 *    - cursor: chuỗi base64url chứa { createdAt, id }.
 * 4. Chặn query lạ hoặc tham số limit/cursor sai định dạng -> trả về 400 INVALID_QUERY / INVALID_CURSOR.
 * 5. Trả về: items (đã chuyển toJSON, không lộ _id, __v, userId, dedupKey), nextCursor, unreadCount.
 * 6. Danh sách rỗng trả về HTTP 200 kèm items: [].
 */
export async function listNotifications(req, res, next) {
  try {
    const userId = req.user._id;

    // 1. Kiểm tra allowlist query params
    const ALLOWED_QUERY_KEYS = new Set(['limit', 'cursor']);
    for (const key of Object.keys(req.query)) {
      if (!ALLOWED_QUERY_KEYS.has(key) || key.includes('.') || key.includes('$')) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_QUERY',
          message: `Tham số truy vấn "${key}" không được hỗ trợ.`
        });
      }
    }

    // 2. Xác thực và chuẩn hóa limit
    let limit = 20;
    if (req.query.limit !== undefined) {
      const rawLimit = String(req.query.limit).trim();
      if (!/^\d+$/.test(rawLimit)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_QUERY',
          message: 'Tham số limit không hợp lệ (phải là số nguyên từ 1 đến 50).'
        });
      }
      const parsed = parseInt(rawLimit, 10);
      if (parsed < 1 || parsed > 50) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_QUERY',
          message: 'Tham số limit không hợp lệ (phải là số nguyên từ 1 đến 50).'
        });
      }
      limit = parsed;
    }

    // 3. Xác thực và giải mã cursor nếu có
    let cursorFilter = null;
    if (req.query.cursor !== undefined) {
      const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';
      if (!rawCursor) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_CURSOR',
          message: 'Cursor phân trang không hợp lệ.'
        });
      }

      try {
        const decoded = Buffer.from(rawCursor, 'base64url').toString('utf-8');
        const parsed = JSON.parse(decoded);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Cursor must be an object');
        }

        if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
          throw new Error('Missing createdAt or id in cursor');
        }

        const cursorDate = new Date(parsed.createdAt);
        if (isNaN(cursorDate.getTime())) {
          throw new Error('Invalid cursor createdAt timestamp');
        }

        if (!mongoose.Types.ObjectId.isValid(parsed.id) || !/^[0-9a-fA-F]{24}$/.test(parsed.id)) {
          throw new Error('Invalid cursor id');
        }

        cursorFilter = {
          cursorDate,
          cursorId: new mongoose.Types.ObjectId(parsed.id)
        };
      } catch {
        return res.status(400).json({
          success: false,
          code: 'INVALID_CURSOR',
          message: 'Cursor phân trang không hợp lệ.'
        });
      }
    }

    // 4. Xây dựng bộ lọc MongoDB
    const filter = { userId };
    if (cursorFilter) {
      filter.$or = [
        { createdAt: { $lt: cursorFilter.cursorDate } },
        {
          createdAt: cursorFilter.cursorDate,
          _id: { $lt: cursorFilter.cursorId }
        }
      ];
    }

    // 5. Truy vấn limit + 1 để xác định trang kế tiếp
    const docs = await Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    let nextCursor = null;
    let items = docs;

    if (docs.length > limit) {
      items = docs.slice(0, limit);
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: lastItem.createdAt.toISOString(),
          id: lastItem._id.toString()
        }),
        'utf-8'
      ).toString('base64url');
    }

    // 6. Đếm số thông báo chưa đọc của người dùng
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false
    });

    return res.status(200).json({
      success: true,
      code: 'OK',
      data: {
        items: items.map((doc) => doc.toJSON()),
        nextCursor,
        unreadCount
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đánh dấu đã đọc một thông báo (PATCH /api/notifications/:id/read).
 *
 * Yêu cầu & Quy tắc:
 * 1. requireAuth + verifyOrigin + requireJsonContentType.
 * 2. ID không hợp lệ hoặc không thuộc user hiện tại: trả về 404 trung tính NOTIFICATION_NOT_FOUND.
 * 3. Idempotent: Gọi nhiều lần không thay đổi readAt nếu đã đọc.
 * 4. Không nhận userId, isRead, readAt tùy ý từ client (từ chối 400 nếu truyền body có thuộc tính lạ).
 */
export async function markAsRead(req, res, next) {
  try {
    const userId = req.user._id;
    const notifId = req.params.id;

    // 1. Kiểm tra ID: nếu không phải ObjectId hợp lệ -> trả về 404 trung tính
    if (!notifId || !mongoose.Types.ObjectId.isValid(notifId) || !/^[0-9a-fA-F]{24}$/.test(notifId)) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Thông báo không tồn tại.'
      });
    }

    // 2. Chặn các trường body tùy ý từ client
    if (req.body && typeof req.body === 'object') {
      const keys = Object.keys(req.body);
      for (const key of keys) {
        if (key.includes('.') || key.includes('$') || key) {
          return res.status(400).json({
            success: false,
            code: 'UNKNOWN_FIELD_REJECTED',
            message: `Trường "${key}" không được hỗ trợ trong yêu cầu này.`
          });
        }
      }
    }

    // 3. Cập nhật nguyên tử: Chỉ request chuyển từ chưa đọc (isRead: false) sang đã đọc mới đặt readAt
    const now = new Date();
    const targetObjectId = new mongoose.Types.ObjectId(notifId);

    const updatedDoc = await Notification.findOneAndUpdate(
      {
        _id: targetObjectId,
        userId,
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: now
        }
      },
      { returnDocument: 'after' }
    );

    if (updatedDoc) {
      return res.status(200).json({
        success: true,
        code: 'OK',
        data: {
          notification: updatedDoc.toJSON()
        }
      });
    }

    // 4. Nếu updatedDoc là null, kiểm tra xem bản ghi có tồn tại và thuộc về user không (đã đọc từ trước)
    const existing = await Notification.findOne({
      _id: targetObjectId,
      userId
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Thông báo không tồn tại.'
      });
    }

    // Đã đọc từ trước: trả bản ghi hiện tại và bảo toàn nguyên vẹn mốc readAt cũ
    return res.status(200).json({
      success: true,
      code: 'OK',
      data: {
        notification: existing.toJSON()
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Đánh dấu đã đọc tất cả thông báo hiện có (PATCH /api/notifications/read-all).
 *
 * Yêu cầu & Quy tắc:
 * 1. requireAuth + verifyOrigin + requireJsonContentType.
 * 2. Chỉ cập nhật thông báo của user hiện tại.
 * 3. Chốt mốc thời gian cutoffTime = new Date() tại thời điểm bắt đầu để không vô tình đánh dấu
 *    các thông báo mới phát sinh sau đó.
 * 4. Không nhận bộ lọc hay trường tùy ý từ client.
 * 5. Trả về updatedCount (số lượng bản ghi thực tế được chuyển từ chưa đọc sang đã đọc).
 */
export async function markAllAsRead(req, res, next) {
  try {
    const userId = req.user._id;

    // 1. Chặn các trường body tùy ý từ client
    if (req.body && typeof req.body === 'object') {
      const keys = Object.keys(req.body);
      for (const key of keys) {
        if (key.includes('.') || key.includes('$') || key) {
          return res.status(400).json({
            success: false,
            code: 'UNKNOWN_FIELD_REJECTED',
            message: `Trường "${key}" không được hỗ trợ trong yêu cầu này.`
          });
        }
      }
    }

    // 2. Chốt mốc cutoffTime tại thời điểm bắt đầu
    const cutoffTime = new Date();

    // 3. Cập nhật nguyên tử tất cả thông báo chưa đọc thuộc userId với createdAt <= cutoffTime
    const result = await Notification.updateMany(
      {
        userId,
        isRead: false,
        createdAt: { $lte: cutoffTime }
      },
      {
        $set: {
          isRead: true,
          readAt: cutoffTime
        }
      }
    );

    return res.status(200).json({
      success: true,
      code: 'OK',
      data: {
        updatedCount: result.modifiedCount || 0
      }
    });
  } catch (error) {
    next(error);
  }
}
