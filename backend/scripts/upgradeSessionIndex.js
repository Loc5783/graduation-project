import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Script quản trị nâng cấp chỉ mục sessionStoreId_1 cho UserSession (Giai đoạn 3A)
 *
 * Chế độ:
 * 1. Khảo sát / Dry-run (mặc định hoặc khi truyền --survey / --dry-run):
 *    - Khảo sát cấu hình chỉ mục hiện tại trên collection user_sessions.
 *    - Thống kê các nhóm sessionStoreId bị trùng lặp và các bản ghi không hợp lệ.
 *    - Báo cáo tổng hợp số liệu ẩn danh (KHÔNG in raw session ID, cookie, hash hay secret).
 *    - Tuyệt đối KHÔNG thay đổi dữ liệu hoặc chỉ mục.
 *
 * 2. Áp dụng nâng cấp (chỉ khi có cờ --apply):
 *    - Nếu phát hiện dữ liệu trùng lặp: DỪNG AN TOÀN, không tự tiện xóa/gộp dữ liệu.
 *    - Nếu dữ liệu toàn vẹn (không có duplicate): drop chỉ mục cũ (nếu có) và tạo Unique Index.
 *    - Xác minh chỉ mục sau khi tạo trên MongoDB thực tế.
 */

export async function surveyOrUpgradeSessionIndex(options = {}) {
  const mode = options.mode || 'survey'; // 'survey' | 'apply'
  const uri = options.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart-home-privacy';
  const customConnection = options.connection || null;

  let conn = customConnection;
  let shouldDisconnect = false;

  if (!conn) {
    conn = await mongoose.createConnection(uri).asPromise();
    shouldDisconnect = true;
  }

  try {
    const db = conn.db;
    const collections = await db.listCollections({ name: 'user_sessions' }).toArray();

    if (collections.length === 0) {
      const result = {
        success: true,
        mode,
        collectionExists: false,
        isUnique: false,
        duplicateGroupsCount: 0,
        totalExcess: 0,
        revokedGroupsCount: 0,
        invalidCount: 0,
        message: 'Collection user_sessions chưa tồn tại. Sẽ được khởi tạo tự động cùng Unique Index khi khởi động server.'
      };
      return result;
    }

    const collection = db.collection('user_sessions');
    const indexes = await collection.indexes();
    const sessionStoreIndex = indexes.find((idx) => idx.name === 'sessionStoreId_1');

    // 1. Thống kê dữ liệu trùng lặp
    const duplicateGroups = await collection.aggregate([
      { $match: { sessionStoreId: { $ne: null } } },
      {
        $group: {
          _id: '$sessionStoreId',
          count: { $sum: 1 },
          revokedCount: { $sum: { $cond: ['$isRevoked', 1, 0] } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    const duplicateGroupsCount = duplicateGroups.length;
    const totalExcess = duplicateGroups.reduce((acc, g) => acc + (g.count - 1), 0);
    const revokedGroupsCount = duplicateGroups.filter((g) => g.revokedCount > 0).length;

    // 2. Thống kê bản ghi thiếu trường bắt buộc
    const invalidCount = await collection.countDocuments({
      $or: [
        { sessionStoreId: null },
        { sessionStoreId: '' },
        { userId: null },
        { sessionId: null }
      ]
    });

    const isCurrentUnique = Boolean(sessionStoreIndex && sessionStoreIndex.unique);

    const report = {
      collectionExists: true,
      indexFound: Boolean(sessionStoreIndex),
      isUnique: isCurrentUnique,
      duplicateGroupsCount,
      totalExcess,
      revokedGroupsCount,
      invalidCount
    };

    if (mode === 'survey') {
      return {
        success: true,
        mode: 'survey',
        ...report,
        message: duplicateGroupsCount > 0
          ? `Phát hiện ${duplicateGroupsCount} nhóm sessionStoreId trùng lặp (${totalExcess} bản ghi thừa). Cần xử lý dữ liệu trước khi nâng cấp index.`
          : isCurrentUnique
            ? 'Chỉ mục sessionStoreId_1 đã có unique: true. Không cần nâng cấp.'
            : 'Dữ liệu toàn vẹn (0 nhóm trùng). Sẵn sàng nâng cấp bằng cờ --apply.'
      };
    }

    if (mode === 'apply') {
      // Dừng an toàn nếu phát hiện dữ liệu trùng lặp
      if (duplicateGroupsCount > 0) {
        throw new Error(
          `[DỪNG AN TOÀN] Phát hiện ${duplicateGroupsCount} nhóm sessionStoreId trùng lặp (${totalExcess} bản ghi thừa, ${revokedGroupsCount} nhóm có chứa phiên đã thu hồi). ` +
          'Script dừng lại và KHÔNG tự ý xóa hoặc thay đổi dữ liệu để bảo vệ dữ liệu người dùng và không làm mất dấu phiên đã thu hồi. ' +
          'Vui lòng rà soát và xử lý dữ liệu trước khi chạy lại.'
        );
      }

      if (invalidCount > 0) {
        throw new Error(
          `[DỪNG AN TOÀN] Phát hiện ${invalidCount} bản ghi thiếu trường bắt buộc trong user_sessions. ` +
          'Vui lòng làm sạch dữ liệu trước khi nâng cấp index.'
        );
      }

      // Nếu đã có index non-unique, gỡ bỏ trước khi tạo mới
      if (sessionStoreIndex && !sessionStoreIndex.unique) {
        await collection.dropIndex('sessionStoreId_1');
      }

      // Tạo chỉ mục Unique
      if (!sessionStoreIndex || !sessionStoreIndex.unique) {
        await collection.createIndex({ sessionStoreId: 1 }, { unique: true });
      }

      // Kiểm chứng thực tế trên MongoDB sau khi tạo
      const updatedIndexes = await collection.indexes();
      const updatedIndex = updatedIndexes.find((idx) => idx.name === 'sessionStoreId_1');
      if (!updatedIndex || !updatedIndex.unique) {
        throw new Error('Kiểm chứng chỉ mục sau nâng cấp thất bại: sessionStoreId_1 chưa có unique: true.');
      }

      return {
        success: true,
        mode: 'apply',
        ...report,
        isUnique: true,
        message: 'Nâng cấp chỉ mục sessionStoreId_1 thành Unique Index thành công và đã được kiểm chứng trên MongoDB.'
      };
    }

    throw new Error(`Chế độ không hợp lệ: ${mode}`);
  } finally {
    if (shouldDisconnect && conn) {
      await conn.close();
    }
  }
}

// Chạy trực tiếp từ dòng lệnh CLI
const currentFilePath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath);

if (isMain) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const mode = isApply ? 'apply' : 'survey';

  console.log(`=== BẮT ĐẦU QUẢN TRỊ CHỈ MỤC USER_SESSIONS (Chế độ: ${mode.toUpperCase()}) ===`);

  surveyOrUpgradeSessionIndex({ mode })
    .then((result) => {
      console.log('\n--- KẾT QUẢ KHẢO SÁT / NÂNG CẤP ---');
      console.log(`- Collection user_sessions tồn tại: ${result.collectionExists}`);
      console.log(`- Chỉ mục sessionStoreId_1 tồn tại: ${result.indexFound || false}`);
      console.log(`- Chỉ mục đã có Unique: ${result.isUnique}`);
      console.log(`- Số nhóm sessionStoreId trùng lặp: ${result.duplicateGroupsCount || 0}`);
      console.log(`- Tổng số bản ghi thừa (excess): ${result.totalExcess || 0}`);
      console.log(`- Số nhóm có phiên đã thu hồi: ${result.revokedGroupsCount || 0}`);
      console.log(`- Số bản ghi không hợp lệ: ${result.invalidCount || 0}`);
      console.log(`\nThông điệp: ${result.message}`);
      if (mode === 'survey') {
        console.log('\n[GHI CHÚ] Đây là chế độ KHẢO SÁT (Dry-run). Không có dữ liệu hoặc chỉ mục nào bị thay đổi.');
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\n[LỖI QUẢN TRỊ] ${err.message}`);
      process.exit(1);
    });
}
