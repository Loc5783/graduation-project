import mongoose from 'mongoose';
import {
  APPEARANCE_DEFAULTS,
  APPEARANCE_ENUMS,
  isValidTimeZone
} from '../constants/settingsDefaults.js';
import {
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_ENUMS,
  isValidTimeFormat
} from '../constants/notificationDefaults.js';
import {
  PRIVACY_DEFAULTS,
  PRIVACY_ENUMS
} from '../constants/privacyDefaults.js';

const appearanceSchema = new mongoose.Schema(
  {
    theme: {
      type: String,
      enum: APPEARANCE_ENUMS.theme,
      default: APPEARANCE_DEFAULTS.theme
    },
    language: {
      type: String,
      enum: APPEARANCE_ENUMS.language,
      default: APPEARANCE_DEFAULTS.language
    },
    fontSize: {
      type: String,
      enum: APPEARANCE_ENUMS.fontSize,
      default: APPEARANCE_DEFAULTS.fontSize
    },
    highContrast: {
      type: Boolean,
      default: APPEARANCE_DEFAULTS.highContrast
    },
    reducedMotion: {
      type: Boolean,
      default: APPEARANCE_DEFAULTS.reducedMotion
    },
    timeZone: {
      type: String,
      maxlength: 50,
      validate: {
        validator: isValidTimeZone,
        message: 'Múi giờ không hợp lệ.'
      },
      default: APPEARANCE_DEFAULTS.timeZone
    },
    dateFormat: {
      type: String,
      enum: APPEARANCE_ENUMS.dateFormat,
      default: APPEARANCE_DEFAULTS.dateFormat
    },
    hourFormat: {
      type: String,
      enum: APPEARANCE_ENUMS.hourFormat,
      default: APPEARANCE_DEFAULTS.hourFormat
    }
  },
  { _id: false }
);

const quietHoursSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.quietHours.enabled
    },
    startTime: {
      type: String,
      default: NOTIFICATION_DEFAULTS.quietHours.startTime,
      validate: {
        validator: isValidTimeFormat,
        message: 'Giờ bắt đầu không hợp lệ (HH:mm).'
      }
    },
    endTime: {
      type: String,
      default: NOTIFICATION_DEFAULTS.quietHours.endTime,
      validate: {
        validator: isValidTimeFormat,
        message: 'Giờ kết thúc không hợp lệ (HH:mm).'
      }
    },
    allowUrgentBypass: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.quietHours.allowUrgentBypass
    }
  },
  { _id: false }
);

const notificationTypesSchema = new mongoose.Schema(
  {
    unusualAccess: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.types.unusualAccess
    },
    deviceDisconnected: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.types.deviceDisconnected
    },
    permissionChanges: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.types.permissionChanges
    },
    monthlyReport: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.types.monthlyReport
    }
  },
  { _id: false }
);

const notificationChannelsSchema = new mongoose.Schema(
  {
    inAppWeb: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.channels.inAppWeb
    },
    email: {
      type: Boolean,
      default: NOTIFICATION_DEFAULTS.channels.email
    }
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    types: {
      type: notificationTypesSchema,
      default: () => ({})
    },
    minSeverity: {
      type: String,
      enum: NOTIFICATION_ENUMS.minSeverity,
      default: NOTIFICATION_DEFAULTS.minSeverity
    },
    quietHours: {
      type: quietHoursSchema,
      default: () => ({})
    },
    channels: {
      type: notificationChannelsSchema,
      default: () => ({})
    }
  },
  { _id: false }
);

const privacySettingsSchema = new mongoose.Schema(
  {
    retentionDays: {
      type: Number,
      enum: PRIVACY_ENUMS.retentionDays,
      default: PRIVACY_DEFAULTS.retentionDays
    }
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    appearance: {
      type: appearanceSchema,
      default: () => ({})
    },
    notifications: {
      type: notificationSettingsSchema,
      default: () => ({})
    },
    privacy: {
      type: privacySettingsSchema,
      default: () => ({})
    }
  },
  { _id: false }
);

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
    authVersion: {
      type: Number,
      default: 0,
      min: 0
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      default: 'viewer'
    },
    owned: {
      type: [String],
      default: []
    },
    settings: {
      type: settingsSchema,
      default: () => ({})
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
        delete ret.authVersion; // Không để lộ phiên bản xác thực nội bộ ra JSON
        return ret;
      }
    }
  }
);

// Xây dựng chỉ mục duy nhất (Unique Index) cho email ở tầng MongoDB
userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model('User', userSchema);
export default User;
