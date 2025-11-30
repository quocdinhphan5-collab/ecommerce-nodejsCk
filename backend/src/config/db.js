// src/config/db.js (ví dụ)
const mongoose = require('mongoose');

const DEFAULT_URL = 'mongodb://mongo:27017/ecommerce_db';
const MONGO_URL = process.env.MONGO_URL || DEFAULT_URL;

const MAX_RETRY = 20;
const RETRY_DELAY_MS = 5000;

// Kiểm tra format MONGO_URL để bắt lỗi "Invalid scheme" sớm
function assertValidMongoUrl(url) {
  if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) {
    throw new Error(
      `MONGO_URL không hợp lệ: "${url}". Phải bắt đầu bằng "mongodb://" hoặc "mongodb+srv://"`
    );
  }
}


async function connectWithRetry() {
  // In ra cho dễ debug
  console.log('[MongoDB] MONGO_URL =', MONGO_URL);

  // Nếu sai format sẽ ném lỗi ngay tại đây
  assertValidMongoUrl(MONGO_URL);

  let attempt = 1;

  while (attempt <= MAX_RETRY) {
    try {
      console.log(`🔌 [MongoDB] Kết nối lần ${attempt} tới ${MONGO_URL} ...`);

      await mongoose.connect(MONGO_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      console.log('✅ [MongoDB] Đã kết nối MongoDB thành công');
      return; // chỉ return khi connect OK
    } catch (err) {
      console.error(`❌ Lỗi kết nối MongoDB (lần ${attempt}):`, err.message);

      if (attempt === MAX_RETRY) {
        console.error('💥 Thử kết nối nhiều lần nhưng vẫn thất bại. Thoát ứng dụng.');
        throw err; // để start() bắt được và thoát
      }

      console.log(
        `⏳ MongoDB chưa sẵn sàng, đợi ${RETRY_DELAY_MS / 1000} giây rồi thử lại...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      attempt += 1;
    }
  }
}

module.exports = connectWithRetry;
