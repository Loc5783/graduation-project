import mongoose from 'mongoose';

/**
 * Schema quản lý metadata và vòng đời phiên đăng nhập người dùng (Session Registry)
 * 
 * Mục đích:
 * 1. Lưu trữ mã quản lý phiên công khai (sessionId: UUID) tách biệt hoàn toàn với raw session ID / cookie.
 * 2. Lưu trữ thông tin thiết bị, trình duyệt, thời gian tạo, hoạt động gần nhất và thời hạn.
 * 3. Hỗ trợ thu hồi phiên nguyên tử (isRevoked) và ngăn chặn phiên đã thu hồi sống lại (Revived Session Trap).
 * 4. Truy vấn nhanh theo người dùng với các chỉ mục tối ưu, không quét toàn bộ bảng.
 */
const userSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionStoreId: {
      type: String,
      required: true,
      trim: true
    },
    authVersion: {
      type: Number,
      required: true,
      default: 0
    },
    deviceLabel: {
      type: String,
      default: null
    },
    browserLabel: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastActiveAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    isRevoked: {
      type: Boolean,
      required: true,
      default: false
    },
    revokedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: false,
    collection: 'user_sessions',
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret.sessionId;
        delete ret._id;
        delete ret.__v;
        delete ret.sessionStoreId; // Tuyệt đối không để lộ raw session ID
        delete ret.userId;
        delete ret.authVersion;
        delete ret.isRevoked;
        delete ret.revokedAt;
        return ret;
      }
    }
  }
);

// 1. Chỉ mục tối ưu cho danh sách phiên đang hoạt động của người dùng
userSessionSchema.index({ userId: 1, isRevoked: 1, expiresAt: 1, authVersion: 1 });

// 2. Chỉ mục DUY NHẤT cho raw sessionStoreId (bảo đảm mỗi phiên trong store chỉ có đúng 1 bản ghi registry)
userSessionSchema.index({ sessionStoreId: 1 }, { unique: true });

// 3. Chỉ mục thời hạn phiên
userSessionSchema.index({ expiresAt: 1 });

export const UserSession = mongoose.model('UserSession', userSessionSchema);
export default UserSession;
