import ActivityLog from '../models/ActivityLog.js';

export async function recordActivity(event) {
  try {
    if (event.viewBucket) {
      await ActivityLog.updateOne({ viewBucket: event.viewBucket }, { $setOnInsert: event }, { upsert: true });
    } else {
      await ActivityLog.create(event);
    }
  } catch (error) {
    // Nhật ký lỗi không được biến một thao tác đã hoàn thành thành lỗi giả trên giao diện.
    console.error('[ActivityLog] Không thể ghi sự kiện:', error.message);
  }
}

export function publicActivity(row) {
  return {
    id: String(row._id), action: row.action, deviceId: row.deviceId || null,
    actor: row.actorId && typeof row.actorId === 'object' ? { name: row.actorId.name, email: row.actorId.email } : null,
    subject: row.subjectId && typeof row.subjectId === 'object' ? { name: row.subjectId.name, email: row.subjectId.email } : null,
    createdAt: row.createdAt, deviceLabel: row.deviceLabel || null, browserLabel: row.browserLabel || null,
    detail: row.detail || null
  };
}
