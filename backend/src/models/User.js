import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Họ và tên là bắt buộc.'],
      trim: true,
      minlength: [2, 'Họ và tên phải có tối thiểu 2 ký tự.'],
      maxlength: [100, 'Họ và tên không được vượt quá 100 ký tự.']
    },
    email: {
      type: String,
      required: [true, 'Địa chỉ email là bắt buộc.'],
      trim: true,
      lowercase: true,
      maxlength: [255, 'Email không được vượt quá 255 ký tự.']
    },
    passwordHash: {
      type: String,
      required: [true, 'Mật khẩu băm là bắt buộc.']
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      default: 'viewer'
    },
    owned: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash; // Tuyệt đối không để lộ mật khẩu băm ra JSON
        return ret;
      }
    }
  }
);

// Xây dựng chỉ mục duy nhất (Unique Index) cho email ở tầng MongoDB
userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
export default User;
