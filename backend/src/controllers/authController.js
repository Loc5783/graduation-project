import bcrypt from 'bcryptjs';
import User from '../models/User.js';

// Hash mẫu định dạng bcrypt hợp lệ dùng để ngăn chặn tấn công Timing Attack khi không tìm thấy user
const DUMMY_HASH = '$2b$10$mZx5eYBEFGMl8F8kHFsCE.fRS0THTVp5US0ZRgsrN1yDhwEKfTEj6';

// Regex kiểm tra định dạng email cơ bản nhưng chặt chẽ
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Xử lý đăng ký tài khoản mới (POST /api/auth/register)
 * - Chỉ nhận allowlist: fullName, email, password
 * - Không cho phép client gửi role hay owned để nâng quyền
 * - Kiểm tra độ dài mật khẩu UTF-8 tối đa 72 byte và tối thiểu 8 ký tự
 * - Không tự động đăng nhập sau khi đăng ký
 */
export async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body || {};

    const errors = {};

    // 1. Kiểm tra họ và tên
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      errors.fullName = 'Họ và tên phải có tối thiểu 2 ký tự.';
    } else if (fullName.trim().length > 100) {
      errors.fullName = 'Họ và tên không được vượt quá 100 ký tự.';
    }

    // 2. Kiểm tra email
    if (!email || typeof email !== 'string') {
      errors.email = 'Địa chỉ email là bắt buộc.';
    } else {
      const trimmedEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 255) {
        errors.email = 'Địa chỉ email không đúng định dạng.';
      }
    }

    // 3. Kiểm tra mật khẩu (KHÔNG TRIM mật khẩu)
    if (!password || typeof password !== 'string') {
      errors.password = 'Mật khẩu là bắt buộc.';
    } else {
      const byteLength = Buffer.byteLength(password, 'utf8');
      if (password.length < 8) {
        errors.password = 'Mật khẩu phải có tối thiểu 8 ký tự.';
      } else if (byteLength > 72) {
        errors.password = 'Mật khẩu không được vượt quá 72 byte UTF-8.';
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Thông tin đăng ký không hợp lệ.',
        errors
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedName = fullName.trim();

    // Kiểm tra trùng lặp email trước khi băm để trả lời nhanh
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_KEY',
        message: 'Địa chỉ email này đã được sử dụng.',
        errors: {
          email: 'Đã tồn tại trong hệ thống.'
        }
      });
    }

    // Băm mật khẩu bất đồng bộ bằng bcryptjs
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Lưu vào database với quyền cố định: viewer, owned: []
    const newUser = await User.create({
      name: sanitizedName,
      email: normalizedEmail,
      passwordHash,
      role: 'viewer',
      owned: []
    });

    // Trả về 201 Created (không kèm passwordHash, không tạo session)
    return res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công.',
      data: {
        user: {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          owned: newUser.owned,
          createdAt: newUser.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Xử lý đăng nhập tài khoản (POST /api/auth/login)
 * - Chống Timing Attack bằng dummy hash nếu email không tồn tại
 * - Sai email hoặc mật khẩu đều trả về cùng một thông báo chung
 * - Regenerate session để chống Session Fixation
 * - Lưu session trong MongoDB trước khi phản hồi 200
 */
export async function login(req, res, next) {
  try {
    const { email, password, remember } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Email và mật khẩu là bắt buộc.'
      });
    }

    // 1. Kiểm tra kiểu của remember: mặc định false nếu thiếu; nếu có bắt buộc là boolean
    let isRemember = false;
    if (remember !== undefined) {
      if (typeof remember !== 'boolean') {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Trường remember phải là giá trị boolean (true hoặc false).',
          errors: {
            remember: 'Giá trị remember không đúng định dạng boolean.'
          }
        });
      }
      isRemember = remember;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Nếu mật khẩu vượt quá 72 byte, chắc chắn không thể khớp (bcrypt chỉ băm tối đa 72 byte)
    // Nhưng vẫn chạy dummy compare để giữ timing nhất quán
    const byteLength = Buffer.byteLength(password, 'utf8');
    if (byteLength > 72) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Dummy compare để chống timing attack dò tìm email
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác.'
      });
    }

    // Tái tạo session ID mới (Regenerate session) để ngăn chặn Session Fixation
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      req.session.userId = user._id.toString();

      // Cấu hình thời hạn phiên: 14 ngày nếu ghi nhớ, mặc định 1 ngày
      const maxAge = isRemember ? 14 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      req.session.cookie.maxAge = maxAge;

      // Lưu phiên vào MongoDB store trước khi gửi phản hồi cho client
      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        return res.status(200).json({
          success: true,
          message: 'Đăng nhập thành công.',
          data: {
            user: {
              id: user._id.toString(),
              name: user.name,
              email: user.email,
              role: user.role,
              owned: user.owned
            }
          }
        });
      });
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Lấy thông tin tài khoản hiện tại từ phiên đăng nhập (GET /api/auth/me)
 * Được bảo vệ bởi requireAuth middleware
 */
export async function me(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user._id.toString(),
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        owned: req.user.owned,
        createdAt: req.user.createdAt
      }
    }
  });
}

/**
 * Đăng xuất và hủy phiên làm việc (POST /api/auth/logout)
 * - Chờ hủy phiên trên MongoDB store thành công
 * - Xóa cookie shp_sid với đúng các thuộc tính bảo mật
 */
export async function logout(req, res) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };

  if (!req.session) {
    res.clearCookie('shp_sid', cookieOptions);
    return res.status(200).json({
      success: true,
      message: 'Đã đăng xuất thành công.'
    });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[Session Error] Không thể hủy phiên làm việc trên store:', err.message);
      return res.status(500).json({
        success: false,
        code: 'LOGOUT_FAILED',
        message: 'Không thể đăng xuất phiên làm việc phía máy chủ.'
      });
    }

    res.clearCookie('shp_sid', cookieOptions);
    return res.status(200).json({
      success: true,
      message: 'Đã đăng xuất thành công.'
    });
  });
}
