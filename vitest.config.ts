import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://saas:saas_password@localhost:5432/saas_imob_test?schema=public",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "test-only-secret-0123456789abcdef0123456789abcdef-0123",
      JWT_EXPIRES_IN: "1h",
      SESSION_COOKIE: "saas_session_test",
      APP_DOMAIN: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});