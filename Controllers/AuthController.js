import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import CatchAsync from "../Utilities/CatchAsync.js";

import { refreshTokenService, LogOutService, LoginService, SignUpService, ProtectionService, ForgotPasswordService, ResetPasswordService, VerifyEmailService, ImpersonateService, GenerateApiKeyService } from "../Services/AuthServices.js";
import { notifyAdmins } from "../Services/NotificationHelpers.js";

// ─── Helper ───────────────────────────────────────────────────────────────────
const CreateAndSendTokens = (req, res, accessToken, refreshToken) => {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";

  // sameSite:"none" + secure:true are required when the frontend and API are on
  // different domains (e.g. Vite on Vercel, API on Render). In development the
  // connection is plain HTTP so we fall back to "lax" / secure:false.
  const sameSite = isSecure ? "none" : "lax";

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    expires: new Date(Date.now() + 120 * 60 * 1000), // 120 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
};

// ─── Sign Up ──────────────────────────────────────────────────────────────────
const signUpController = CatchAsync(async (req, res, next) => {
  let user = { ...req.body };

  if (Object.keys(user).length === 0) {
    throw new AppErrorHelper("User data is missing while signing up!", 400);
  }

  const result = await SignUpService(user);

  // Alert admins that a new account was created (best-effort, fire-and-forget)
  if (result.user) {
    notifyAdmins({
      sender: result.user._id,
      type: "new_user",
      title: `👤 New ${result.user.role} registered`,
      message: `${result.user.FullName} just joined as a ${result.user.role}.`,
      link: "/users",
    }).catch(() => {});
  }

  res.status(201).json({
    status: "success",
    message: "Account created. It is waiting for admin approval.",
    data: {
      user: result.user,
      requiresApproval: result.requiresApproval,
    },
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
const loginController = CatchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppErrorHelper("Email and password are required!", 400));
  }

  const { user, accessToken, refreshToken } = await LoginService(email, password);

  if (!user || !accessToken || !refreshToken) {
    return next(new AppErrorHelper("Login failed, please try again!", 500));
  }

  // Set cookies only after all checks pass
  CreateAndSendTokens(req, res, accessToken, refreshToken);

  res.status(200).json({
    status: "success",
    data: { user, token: accessToken },
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
const logoutController = CatchAsync(async (req, res, next) => {
  if (!req.user?._id) {
    throw new AppErrorHelper("User not authenticated", 401);
  }

  await LogOutService(req.user._id);

  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  res.status(200).json({ status: "success", message: "Logged out successfully" });
});

// ─── Refresh Token ────────────────────────────────────────────────────────────
const RefreshController = CatchAsync(async (req, res, next) => {
  const CookieToken = req.cookies.refreshToken;

  if (!CookieToken) {
    throw new AppErrorHelper("No refresh token found!", 401);
  }

  const { accessToken, refreshToken } = await refreshTokenService(CookieToken);

  CreateAndSendTokens(req, res, accessToken, refreshToken);

  res.status(200).json({
    status: "success",
    data: { token: accessToken },
  });
});

// ─── Protection Middleware ────────────────────────────────────────────────────
const protectionController = CatchAsync(async (req, res, next) => {
  const user = await ProtectionService(req);
  req.user = user;
  next();
});

// ─── Role Restriction Middleware ──────────────────────────────────────────────
const restrictedToController = (...allowedRoles) => {
  return CatchAsync(async (req, res, next) => {
    if (!req.user || !req.user.role) {
      throw new AppErrorHelper("You are not logged in!", 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppErrorHelper(`This role (${req.user.role}) doesn't have access to this route!`, 403);
    }

    next();
  });
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
const forgotPasswordController = CatchAsync(async (req, res, _next) => {
  const { email } = req.body;
  if (!email) throw new AppErrorHelper("Email is required", 400);

  const origin = process.env.CLIENT_URL || `${req.protocol}://${req.get("host")}`;
  await ForgotPasswordService(email, origin);

  // Always send the same response — never reveal whether the email exists
  res.status(200).json({
    status: "success",
    message: "If that email is registered, a reset link has been sent.",
  });
});

// ─── Reset Password ───────────────────────────────────────────────────────────
const resetPasswordController = CatchAsync(async (req, res, _next) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) throw new AppErrorHelper("New password is required", 400);

  await ResetPasswordService(token, password);

  res.status(200).json({
    status: "success",
    message: "Password reset successful. Please log in with your new password.",
  });
});

// ─── Email Verification ───────────────────────────────────────────────────────
const verifyEmailController = CatchAsync(async (req, res) => {
  const user = await VerifyEmailService(req.params.token);
  res.status(200).json({
    status: "success",
    message: "Email verified successfully. You can now log in.",
    data: { user: { _id: user._id, FullName: user.FullName, emailVerified: true } },
  });
});

// ─── Admin: Impersonate User ─────────────────────────────────────────────────
const impersonateController = CatchAsync(async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  const { accessToken, target } = await ImpersonateService(req.user, req.params.userId, ip);
  res.status(200).json({
    status: "success",
    message: `Impersonating ${target.FullName}. Token valid for 2 hours.`,
    data: { token: accessToken, target: { _id: target._id, role: target.role, FullName: target.FullName } },
  });
});

// ─── Generate Parent API Key ──────────────────────────────────────────────────
const generateApiKeyController = CatchAsync(async (req, res) => {
  const key = await GenerateApiKeyService(req.user._id);
  res.status(200).json({
    status: "success",
    message: "API key generated. Copy it now — it will not be shown again.",
    data: { apiKey: key },
  });
});

export {
  signUpController,
  loginController,
  RefreshController,
  logoutController,
  protectionController,
  restrictedToController,
  forgotPasswordController,
  resetPasswordController,
  verifyEmailController,
  impersonateController,
  generateApiKeyController,
};
