import Joi from "joi";

// Strong-ish password rule: 8+ chars, at least one lowercase, one uppercase, one digit.
// Symbol is optional — too aggressive a rule hurts UX without much extra safety.
const passwordRule = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  .messages({
    "string.min": "Password must be at least 8 characters",
    "string.max": "Password cannot exceed 128 characters",
    "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    "any.required": "Password is required",
  });

const emailRule = Joi.string()
  .trim()
  .lowercase()
  .email({ minDomainSegments: 2, tlds: { allow: false } })
  .max(254)
  .messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  });

const hexTokenRule = Joi.string()
  .length(64)
  .pattern(/^[a-f0-9]+$/i)
  .messages({
    "string.length": "Invalid token format",
    "string.pattern.base": "Invalid token format",
    "any.required": "Token is required",
  });

// ─── Signup ──────────────────────────────────────────────────────────────────
// Strict allowlist. role is restricted to public self-service roles only;
// admin and instructor accounts must be provisioned by an admin, never by signup.
export const signupSchema = Joi.object({
  FullName: Joi.string().trim().min(2).max(100).required().messages({
    "string.min": "Full name must be at least 2 characters",
    "string.max": "Full name cannot exceed 100 characters",
    "any.required": "Full name is required",
  }),
  UserName: Joi.string()
    .trim()
    .min(3)
    .max(30)
    .pattern(/^[a-zA-Z0-9_]+$/)
    .required()
    .messages({
      "string.min": "Username must be at least 3 characters",
      "string.max": "Username cannot exceed 30 characters",
      "string.pattern.base": "Username may only contain letters, numbers, and underscores",
      "any.required": "Username is required",
    }),
  Email: emailRule.required(),
  password: passwordRule.required(),
  role: Joi.string().valid("student", "parent").default("student").messages({
    "any.only": "Role must be one of: student, parent",
  }),
  avatar: Joi.string().uri().max(500).optional().allow("", null),
});

// ─── Login ───────────────────────────────────────────────────────────────────
export const loginSchema = Joi.object({
  email: emailRule.required(),
  password: Joi.string().min(1).max(128).required().messages({
    "any.required": "Password is required",
  }),
});

// ─── Forgot password ─────────────────────────────────────────────────────────
export const forgotPasswordSchema = Joi.object({
  email: emailRule.required(),
});

// ─── Reset password ──────────────────────────────────────────────────────────
export const resetPasswordSchema = Joi.object({
  password: passwordRule.required(),
});

// ─── URL params for token-bearing routes ────────────────────────────────────
export const tokenParamSchema = Joi.object({
  token: hexTokenRule.required(),
});

// ─── userId for impersonation ────────────────────────────────────────────────
export const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid user ID format",
      "any.required": "User ID is required",
    }),
});
