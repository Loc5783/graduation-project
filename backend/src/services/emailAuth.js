import crypto from 'crypto';
import EmailChallenge from '../models/EmailChallenge.js';

const TEN_MINUTES = 10 * 60 * 1000;
const COOLDOWN = 60 * 1000;
const MAX_ATTEMPTS = 5;

export const emailAuthEnabled = () => process.env.NODE_ENV === 'production' || process.env.EMAIL_AUTH_ENABLED === 'true';

export function assertEmailConfig() {
  if (!emailAuthEnabled()) return;
  for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'SESSION_SECRET']) {
    if (!process.env[key]) throw new Error(`Thiếu cấu hình ${key} cho xác thực email.`);
  }
}

function hashCode(challengeId, code) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`${challengeId}:${code}`).digest('hex');
}

export async function issueEmailChallenge(user, purpose, remember = false) {
  const recent = await EmailChallenge.findOne({ userId: user._id, purpose, consumedAt: null, sentAt: { $gt: new Date(Date.now() - COOLDOWN) } });
  if (recent) return { rateLimited: true };

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const challengeId = crypto.randomUUID();
  const now = new Date();
  const challenge = await EmailChallenge.create({
    challengeId, userId: user._id, authVersion: user.authVersion || 0, purpose, codeHash: hashCode(challengeId, code), remember,
    sentAt: now, expiresAt: new Date(now.getTime() + TEN_MINUTES)
  });
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM, to: [user.email], subject: 'Mã xác nhận SmartHome',
        text: `Mã xác nhận của bạn: ${code}. Mã có hiệu lực trong 10 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.`
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Dịch vụ email trả về HTTP ${response.status}`);
  } catch (error) {
    await EmailChallenge.deleteOne({ _id: challenge._id });
    throw error;
  }
  return { challengeId, expiresInSeconds: 600, resendAfterSeconds: 60 };
}

export async function consumeEmailChallenge(challengeId, code, purpose) {
  if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = new Date();
  const hash = hashCode(challengeId, code);
  const challenge = await EmailChallenge.findOneAndUpdate(
    { challengeId, purpose, codeHash: hash, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { consumedAt: now } }, { new: true }
  );
  if (challenge) return challenge;
  await EmailChallenge.updateOne(
    { challengeId, purpose, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }
  );
  return null;
}

export async function resendEmailChallenge(challengeId, purpose) {
  const challenge = await EmailChallenge.findOne({ challengeId, purpose, consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } });
  if (!challenge) return null;
  const user = await (await import('../models/User.js')).default.findById(challenge.userId);
  if (!user) return null;
  const result = await issueEmailChallenge(user, purpose, challenge.remember);
  if (!result.rateLimited) await EmailChallenge.updateOne({ _id: challenge._id }, { $set: { consumedAt: new Date() } });
  return result;
}
