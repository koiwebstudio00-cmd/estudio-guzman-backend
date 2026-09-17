process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/estudio_guzman_test";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.COOKIE_SECURE = "false";
process.env.STORAGE_ROOT ??= "/tmp/estudio-guzman-test-storage";
