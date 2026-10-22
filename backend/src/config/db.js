import mongoose from 'mongoose';

/**
 * Kết nối tới cơ sở dữ liệu MongoDB thông qua Mongoose.
 * Chỉ khởi động máy chủ sau khi kết nối thành công.
 *
 * @param {string} uri Chuỗi kết nối MongoDB
 * @returns {Promise<mongoose.Connection>}
 */
export async function connectDB(uri) {
  if (!uri) {
    throw new Error('Thiếu cấu hình chuỗi kết nối MONGODB_URI.');
  }

  try {
    const conn = await mongoose.connect(uri, {
      autoIndex: true, // Tự động xây dựng index (unique index email)
      serverSelectionTimeoutMS: 5000 // Hết thời gian chờ kết nối sau 5s
    });

    // Ghi nhận trạng thái kết nối thành công mà không in thông tin nhạy cảm
    console.log(`[Database] Đã kết nối thành công tới MongoDB. Database: ${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error(`[Database Error] Không thể kết nối tới MongoDB: ${error.message}`);
    throw error;
  }
}

/**
 * Ngắt kết nối MongoDB an toàn khi tắt máy chủ hoặc kết thúc kiểm thử
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] Đã ngắt kết nối MongoDB.');
  }
}
