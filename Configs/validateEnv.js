const requiredEnvVars = [
  "CONNECTION_STRING",
  "PORT",
  "NODE_ENV",
  "SALT_ROUNDS",
  "JWT_TOKEN_SECRET",
  "JWT_TOKEN_EXPIRES_IN",
  "JWT_REFRESH_TOKEN_SECRET",
  "JWT_REFRESH_EXPIRES_IN",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const emailEnvVars = ["EMAIL_HOST", "EMAIL_PORT", "EMAIL_SECURE", "EMAIL_USER", "EMAIL_PASS"];
const allowedNodeEnvironments = new Set(["development", "test", "production"]);

const hasValue = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * Parse and validate the bcrypt work factor used by both startup validation and
 * the password hashing helper. Keeping this in one place prevents the runtime
 * and validation rules from drifting apart.
 */
export function parseSaltRounds(value, nodeEnv = process.env.NODE_ENV) {
  const rounds = Number(value);

  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
    throw new Error("SALT_ROUNDS must be an integer between 4 and 15");
  }

  if (nodeEnv === "production" && rounds < 12) {
    throw new Error("SALT_ROUNDS must be at least 12 in production");
  }

  return rounds;
}

/**
 * Validate the complete startup environment before opening network listeners.
 * Email is mandatory in production and may be omitted as a complete group in
 * development/test when those workflows are intentionally disabled.
 */
export function validateEnv() {
  const missing = [];
  const invalid = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === "production";

  for (const envVar of requiredEnvVars) {
    if (!hasValue(process.env[envVar])) {
      missing.push(envVar);
    }
  }

  if (hasValue(process.env.NODE_ENV) && !allowedNodeEnvironments.has(process.env.NODE_ENV)) {
    invalid.push("NODE_ENV must be one of: development, test, production");
  }

  if (hasValue(process.env.PORT)) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      invalid.push("PORT must be an integer between 1 and 65535");
    }
  }

  if (hasValue(process.env.SALT_ROUNDS)) {
    try {
      parseSaltRounds(process.env.SALT_ROUNDS, process.env.NODE_ENV);
    } catch (error) {
      invalid.push(error.message);
    }
  }

  const hasAnyEmailConfig = emailEnvVars.some((envVar) => hasValue(process.env[envVar]));
  if (isProduction || hasAnyEmailConfig) {
    for (const envVar of emailEnvVars) {
      if (!hasValue(process.env[envVar])) {
        missing.push(envVar);
      }
    }

    if (hasValue(process.env.EMAIL_PORT)) {
      const emailPort = Number(process.env.EMAIL_PORT);
      if (!Number.isInteger(emailPort) || emailPort < 1 || emailPort > 65535) {
        invalid.push("EMAIL_PORT must be an integer between 1 and 65535");
      }
    }

    if (hasValue(process.env.EMAIL_SECURE) && !["true", "false"].includes(process.env.EMAIL_SECURE)) {
      invalid.push('EMAIL_SECURE must be either "true" or "false"');
    }
  } else {
    warnings.push("Email is not configured; verification, reset, reminder, and summary emails are disabled");
  }

  if (isProduction) {
    if (hasValue(process.env.JWT_TOKEN_SECRET) && process.env.JWT_TOKEN_SECRET.length < 32) {
      invalid.push("JWT_TOKEN_SECRET must be at least 32 characters in production");
    }
    if (hasValue(process.env.JWT_REFRESH_TOKEN_SECRET) && process.env.JWT_REFRESH_TOKEN_SECRET.length < 32) {
      invalid.push("JWT_REFRESH_TOKEN_SECRET must be at least 32 characters in production");
    }
  }

  if (warnings.length > 0) {
    console.warn("Environment variable warnings:");
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  if (missing.length > 0 || invalid.length > 0) {
    if (missing.length > 0) {
      console.error("Missing required environment variables:");
      missing.forEach((envVar) => console.error(`  - ${envVar}`));
    }
    if (invalid.length > 0) {
      console.error("Invalid environment variables:");
      invalid.forEach((message) => console.error(`  - ${message}`));
    }
    console.error("Copy .env.example to .env and provide real values for the target environment.");
    throw new Error(`Environment validation failed (${missing.length} missing, ${invalid.length} invalid)`);
  }

  console.log("Environment variables validated");
}

export function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set and no default provided`);
  }
  return value || defaultValue;
}

export default validateEnv;
