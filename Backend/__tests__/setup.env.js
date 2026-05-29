// Loaded via jest "setupFiles" — runs BEFORE app modules are required.
// Sets the env vars that app.js / config files read at module-load time so
// tests never depend on a real .env file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-xx';
process.env.JWT_EXPIRES_IN = '1h';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX = '1000';
process.env.OPENAI_API_KEY = 'sk-test-not-used';
process.env.MAX_FILE_SIZE_MB = '5';
process.env.UPLOAD_DIR = 'uploads/';
