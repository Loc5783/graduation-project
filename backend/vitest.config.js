import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // Chạy tuần tự để tránh xung đột dữ liệu trong smart_home_privacy_test
    env: {
      RATE_LIMIT_MAX: '500'
    }
  }
});
