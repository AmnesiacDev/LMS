/**
 * Environment Variables Validation
 *
 * This module validates that all required environment variables are set
 * at application startup. This is a FREE alternative to paid secret management.
 *
 * Usage: Import and call validateEnv() at the top of server.js
 */

const requiredEnvVars = ["CONNECTION_STRING", "PORT", "NODE_ENV", "SALT_ROUNDS", "JWT_TOKEN_SECRET", "JWT_TOKEN_EXPIRES_IN", "JWT_REFRESH_TOKEN_SECRET", "JWT_REFRESH_EXPIRES_IN", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

const optionalEnvVars = ["PRODUCTION_ConnectionString", "CLIENT_URL", "ALLOWED_ORIGINS", "CORS_ORIGIN", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL"];

/**
 * Validates that all required environment variables are set
 * @throws {Error} If any required environment variable is missing
 */
export function validateEnv() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check for weak secrets in production
  if (process.env.NODE_ENV === "production") {
    if (process.env.JWT_TOKEN_SECRET && process.env.JWT_TOKEN_SECRET.length < 32) {
      warnings.push("JWT_TOKEN_SECRET should be at least 32 characters in production");
    }
    if (process.env.JWT_REFRESH_TOKEN_SECRET && process.env.JWT_REFRESH_TOKEN_SECRET.length < 32) {
      warnings.push("JWT_REFRESH_TOKEN_SECRET should be at least 32 characters in production");
    }
    if (process.env.SALT_ROUNDS && parseInt(process.env.SALT_ROUNDS) < 12) {
      warnings.push("SALT_ROUNDS should be at least 12 in production");
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn("⚠️  Environment Variable Warnings:");
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  // Throw error if missing required variables
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((envVar) => console.error(`   - ${envVar}`));
    console.error("\n💡 Tip: Copy .env.example to .env and fill in your values");
    console.error("   cp .env.example .env\n");
    throw new Error(`Missing ${missing.length} required environment variable(s)`);
  }

  console.log("✅ All required environment variables are set");
}

/**
 * Gets an environment variable with a default value
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not set
 * @returns {string} Environment variable value or default
 */
export function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set and no default provided`);
  }
  return value || defaultValue;
}

export default validateEnv;
