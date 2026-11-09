import User from '../models/User.js';
import { normalizeAppearance } from '../constants/settingsDefaults.js';
import { validateAppearanceUpdate } from '../validators/settingsValidator.js';
import { normalizeNotifications } from '../constants/notificationDefaults.js';
import { validateNotificationUpdate } from '../validators/notificationValidator.js';
import { normalizePrivacy } from '../constants/privacyDefaults.js';
import { validatePrivacyUpdate } from '../validators/privacyValidator.js';

/**
 * Lấy thông tin cài đặt của người dùng hiện tại (GET /api/settings).
 * Yêu cầu đăng nhập hợp lệ (requireAuth).
 * 
 * Đặc điểm:
 * - Không yêu cầu Content-Type cho GET không có body.
 * - Luôn lấy định danh từ session máy chủ (req.session.userId).
 * - Chuẩn hóa xuất đủ các trường hợp lệ kể cả với tài khoản cũ (thiếu settings hoặc thiếu một phần).
 * - GET tuyệt đối không ghi thêm bất kỳ dữ liệu nào vào database.
 */
export async function getSettings(req, res, next) {
  try {
    const userId = req.session.userId;

    // Sử dụng .lean() để lấy dữ liệu thuần túy từ MongoDB mà không kích hoạt chu trình lưu/ghi
    const user = await User.findById(userId).select('settings').lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    const appearance = normalizeAppearance(user.settings?.appearance);
    const notifications = normalizeNotifications(user.settings?.notifications);
    const privacy = normalizePrivacy(user.settings?.privacy);

    return res.status(200).json({
      success: true,
      data: {
        appearance,
        notifications,
        privacy
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật cài đặt giao diện (PATCH /api/settings/appearance).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType.
 * 
 * Đặc điểm:
 * - Validate nghiêm ngặt allowlist 8 trường; từ chối mọi trường lạ hoặc format sai.
 * - Cập nhật nguyên tử qua $set theo từng đường dẫn cụ thể (settings.appearance.<field>).
 * - Không đọc toàn bộ settings rồi save ghi đè.
 * - Không dùng upsert tạo tài khoản ngoài ý muốn.
 * - Trả về dữ liệu appearance sau cập nhật với đầy đủ 8 trường chuẩn.
 */
export async function updateAppearance(req, res, next) {
  try {
    const userId = req.session.userId;

    // 1. Kiểm tra và xác thực body
    const validation = validateAppearanceUpdate(req.body);
    if (!validation.isValid) {
      const responsePayload = {
        success: false,
        code: validation.code,
        message: validation.message
      };
      if (validation.errors) {
        responsePayload.errors = validation.errors;
      }
      return res.status(validation.status || 400).json(responsePayload);
    }

    // 2. Cập nhật nguyên tử và an toàn với cấu trúc settings/appearance bị null hoặc thiếu
    // Sử dụng Update Aggregation Pipeline của MongoDB:
    // - Tự động phục hồi cấu trúc nếu settings hoặc appearance đang là null hoặc không phải object
    // - Bảo toàn toàn bộ các nhóm settings khác (ví dụ settings.privacy) và các trường appearance cũ hợp lệ
    // - Không đọc toàn bộ document rồi save ghi đè
    // - Đảm bảo tính nguyên tử, an toàn tuyệt đối khi có nhiều request đồng thời
    const updatePipeline = [
      {
        $set: {
          settings: {
            $mergeObjects: [
              {
                $cond: [
                  { $eq: [{ $type: '$settings' }, 'object'] },
                  '$settings',
                  {}
                ]
              },
              {
                appearance: {
                  $mergeObjects: [
                    {
                      $cond: [
                        { $eq: [{ $type: '$settings.appearance' }, 'object'] },
                        '$settings.appearance',
                        {}
                      ]
                    },
                    validation.data
                  ]
                }
              }
            ]
          }
        }
      }
    ];

    // 3. Thực hiện cập nhật trên MongoDB (không upsert)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatePipeline,
      {
        returnDocument: 'after',
        updatePipeline: true,
        select: 'settings'
      }
    ).lean();

    if (!updatedUser) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    // 4. Chuẩn hóa response đảm bảo luôn trả đủ 8 trường
    const appearance = normalizeAppearance(updatedUser.settings?.appearance);

    return res.status(200).json({
      success: true,
      data: {
        appearance
      },
      message: 'Cài đặt giao diện đã được cập nhật thành công.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật cài đặt thông báo (PATCH /api/settings/notifications).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType.
 * 
 * Đặc điểm:
 * - Validate nghiêm ngặt whitelist trường; từ chối mọi trường lạ hoặc format sai.
 * - Cho phép partial update ở từng nhánh: types, minSeverity, quietHours, channels.
 * - Cập nhật nguyên tử qua MongoDB Update Aggregation Pipeline.
 * - Không đọc toàn bộ document rồi save ghi đè.
 * - Bảo toàn appearance, các nhóm settings khác, và các lá notifications không có trong PATCH.
 * - Không dùng upsert tạo tài khoản ngoài ý muốn.
 * - Trả về dữ liệu notifications sau cập nhật với đầy đủ cấu trúc chuẩn.
 */
export async function updateNotifications(req, res, next) {
  try {
    const userId = req.session.userId;

    // 1. Kiểm tra và xác thực body
    const validation = validateNotificationUpdate(req.body);
    if (!validation.isValid) {
      const responsePayload = {
        success: false,
        code: validation.code,
        message: validation.message
      };
      if (validation.errors) {
        responsePayload.errors = validation.errors;
      }
      return res.status(validation.status || 400).json(responsePayload);
    }

    // 2. Xây dựng các trường cập nhật nguyên tử cho nhánh notifications
    const notificationFields = {};

    if (validation.data.minSeverity !== undefined) {
      notificationFields.minSeverity = validation.data.minSeverity;
    }

    if (validation.data.types !== undefined) {
      notificationFields.types = {
        $mergeObjects: [
          {
            $cond: [
              { $eq: [{ $type: '$settings.notifications.types' }, 'object'] },
              '$settings.notifications.types',
              {}
            ]
          },
          validation.data.types
        ]
      };
    }

    if (validation.data.quietHours !== undefined) {
      notificationFields.quietHours = {
        $mergeObjects: [
          {
            $cond: [
              { $eq: [{ $type: '$settings.notifications.quietHours' }, 'object'] },
              '$settings.notifications.quietHours',
              {}
            ]
          },
          validation.data.quietHours
        ]
      };
    }

    if (validation.data.channels !== undefined) {
      notificationFields.channels = {
        $mergeObjects: [
          {
            $cond: [
              { $eq: [{ $type: '$settings.notifications.channels' }, 'object'] },
              '$settings.notifications.channels',
              {}
            ]
          },
          validation.data.channels
        ]
      };
    }

    // 3. Pipeline cập nhật nguyên tử bảo toàn toàn bộ cấu trúc settings
    const updatePipeline = [
      {
        $set: {
          settings: {
            $mergeObjects: [
              {
                $cond: [
                  { $eq: [{ $type: '$settings' }, 'object'] },
                  '$settings',
                  {}
                ]
              },
              {
                notifications: {
                  $mergeObjects: [
                    {
                      $cond: [
                        { $eq: [{ $type: '$settings.notifications' }, 'object'] },
                        '$settings.notifications',
                        {}
                      ]
                    },
                    notificationFields
                  ]
                }
              }
            ]
          }
        }
      }
    ];

    // 4. Thực hiện cập nhật trên MongoDB (không upsert)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatePipeline,
      {
        returnDocument: 'after',
        updatePipeline: true,
        select: 'settings'
      }
    ).lean();

    if (!updatedUser) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    // 5. Chuẩn hóa response đảm bảo luôn trả đủ cấu trúc notifications
    const notifications = normalizeNotifications(updatedUser.settings?.notifications);

    return res.status(200).json({
      success: true,
      data: {
        notifications
      },
      message: 'Cài đặt thông báo đã được cập nhật thành công.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Cập nhật cài đặt quyền riêng tư (PATCH /api/settings/privacy).
 * Yêu cầu: requireAuth, verifyOrigin, requireJsonContentType.
 * 
 * Đặc điểm:
 * - Validate nghiêm ngặt allowlist: chỉ chấp nhận retentionDays (7 | 30 | 90).
 * - Kiểm tra strict integer number, từ chối chuỗi ép kiểu, boolean, float, trường lạ, toán tử MongoDB.
 * - Cập nhật nguyên tử qua MongoDB Update Aggregation Pipeline.
 * - Không đọc toàn bộ document rồi save ghi đè.
 * - Bảo toàn appearance, notifications và các nhánh khác trong settings.
 * - Hỗ trợ tài khoản cũ với settings hoặc privacy null một cách an toàn.
 * - Không dùng upsert tạo tài khoản ngoài ý muốn.
 * - Trả về dữ liệu privacy sau cập nhật với đầy đủ cấu trúc chuẩn.
 */
export async function updatePrivacy(req, res, next) {
  try {
    const userId = req.session.userId;

    // 1. Kiểm tra và xác thực body
    const validation = validatePrivacyUpdate(req.body);
    if (!validation.isValid) {
      const responsePayload = {
        success: false,
        code: validation.code,
        message: validation.message
      };
      if (validation.errors) {
        responsePayload.errors = validation.errors;
      }
      return res.status(validation.status || 400).json(responsePayload);
    }

    // 2. Cập nhật nguyên tử và an toàn với cấu trúc settings/privacy bị null hoặc thiếu
    const updatePipeline = [
      {
        $set: {
          settings: {
            $mergeObjects: [
              {
                $cond: [
                  { $eq: [{ $type: '$settings' }, 'object'] },
                  '$settings',
                  {}
                ]
              },
              {
                privacy: {
                  $mergeObjects: [
                    {
                      $cond: [
                        { $eq: [{ $type: '$settings.privacy' }, 'object'] },
                        '$settings.privacy',
                        {}
                      ]
                    },
                    validation.data
                  ]
                }
              }
            ]
          }
        }
      }
    ];

    // 3. Thực hiện cập nhật trên MongoDB (không upsert)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatePipeline,
      {
        returnDocument: 'after',
        updatePipeline: true,
        select: 'settings'
      }
    ).lean();

    if (!updatedUser) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Người dùng không tồn tại hoặc tài khoản đã bị xóa.'
      });
    }

    // 4. Chuẩn hóa response đảm bảo luôn trả đúng cấu trúc privacy
    const privacy = normalizePrivacy(updatedUser.settings?.privacy);

    return res.status(200).json({
      success: true,
      data: {
        privacy
      },
      message: 'Cài đặt quyền riêng tư đã được cập nhật thành công.'
    });
  } catch (error) {
    next(error);
  }
}

