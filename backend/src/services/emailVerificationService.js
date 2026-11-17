import crypto from 'crypto';
import { sendEmail, isEmailConfigured } from './emailService.js';
import User from '../models/User.js';

export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_RESEND_MS = 60 * 1000;

export function emailVerificationEnabled() {
  if (process.env.EMAIL_VERIFICATION_REQUIRED === 'true') return true;
  if (process.env.EMAIL_VERIFICATION_REQUIRED === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

export function generateVerificationCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function hashVerificationCode(userId, code) {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  return crypto.createHmac('sha256', key).update(`${userId}:${code}`).digest('hex');
}

export async function issueVerificationCode(user, now = new Date()) {
  if (!isEmailConfigured()) throw new Error('EMAIL_NOT_CONFIGURED');
  const code = generateVerificationCode();
  const challengeHash = hashVerificationCode(user._id, code);
  const claimed = await User.findOneAndUpdate({
    _id: user._id,
    emailVerifiedAt: null,
    $or: [
      { emailVerificationSentAt: { $exists: false } },
      { emailVerificationSentAt: null },
      { emailVerificationSentAt: { $lte: new Date(now.getTime() - VERIFICATION_RESEND_MS) } }
    ]
  }, { $set: {
    emailVerificationHash: challengeHash,
    emailVerificationExpiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    emailVerificationSentAt: now,
    emailVerificationAttempts: 0
  } }, { returnDocument: 'after' });
  if (!claimed) return false;
  try {
    await sendEmail({
      to: user.email,
      subject: 'Mã xác minh Smart Home Privacy',
      text: `Mã xác minh tài khoản của bạn: ${code}\nMã có hiệu lực trong 10 phút. Nếu bạn không đăng ký, hãy bỏ qua email này.`
    });
    return true;
  } catch (error) {
    // Cho phép gửi lại ngay sau lỗi SMTP; chỉ dọn challenge do request này sở hữu.
    await User.updateOne({ _id: user._id, emailVerificationHash: challengeHash }, {
      $unset: { emailVerificationHash: '', emailVerificationExpiresAt: '', emailVerificationSentAt: '' }
    });
    throw error;
  }
}

export function matchesVerificationCode(user, code, now = new Date()) {
  if (!/^\d{6}$/.test(code || '') || !user.emailVerificationHash || !user.emailVerificationExpiresAt) return false;
  if (user.emailVerificationAttempts >= 5 || user.emailVerificationExpiresAt <= now) return false;
  const expected = Buffer.from(user.emailVerificationHash, 'hex');
  const actual = Buffer.from(hashVerificationCode(user._id, code), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
