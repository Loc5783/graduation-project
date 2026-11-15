import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { normalizePrivacy } from '../constants/privacyDefaults.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Applies only to the user's inbox. Session registry and audit logs have independent
// security retention requirements and must never be removed by this job.
export async function pruneExpiredNotifications(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid clock');
  let deleted = 0;
  const users = User.find({}).select('_id settings.privacy').lean().cursor();
  for await (const user of users) {
    const days = normalizePrivacy(user.settings?.privacy).retentionDays;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const result = await Notification.deleteMany({ userId: user._id, createdAt: { $lt: cutoff } });
    deleted += result.deletedCount || 0;
  }
  return deleted;
}

export function startPrivacyRetention({ intervalMs = DAY_MS, onError = console.error } = {}) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await pruneExpiredNotifications(); }
    catch (error) { onError(error); }
    finally { busy = false; }
  };
  // Run only after the server has completed its database bootstrap.
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  void run();
  return () => clearInterval(timer);
}
