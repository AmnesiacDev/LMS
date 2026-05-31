import express from "express";

import { signUpController, loginController, RefreshController, logoutController, protectionController, restrictedToController, forgotPasswordController, resetPasswordController, verifyEmailController, impersonateController, generateApiKeyController } from "../Controllers/AuthController.js";
import { validate } from "../Middleware/validate.js";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  tokenParamSchema,
  userIdParamSchema,
} from "../Validation/authValidation.js";

const router = express.Router();

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: User's password
 *               role:
 *                 type: string
 *                 enum: [admin, instructor, parent, student]
 *                 default: student
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 token:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - validation error or user already exists
 *       500:
 *         description: Internal server error
 */
router.post("/signup", validate(signupSchema), signUpController);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 token:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: User not found
 */
router.post("/login", validate(loginSchema), loginController);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     description: Use refresh token to get a new access token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Refresh token expired or invalid
 */
router.post("/refresh", RefreshController);

router.post("/forgot-password", validate(forgotPasswordSchema), forgotPasswordController);
router.post(
  "/reset-password/:token",
  validate(tokenParamSchema, "params"),
  validate(resetPasswordSchema),
  resetPasswordController,
);
router.get("/verify-email/:token", validate(tokenParamSchema, "params"), verifyEmailController);

router.use(protectionController);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   get:
 *     summary: Logout user
 *     tags: [Auth]
 *     description: Logout user and invalidate refresh token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.get("/logout", logoutController);

// Parent: generate read-only API key
router.post("/api-key", restrictedToController("parent"), generateApiKeyController);

// Admin only: impersonate any user for debugging
router.post(
  "/impersonate/:userId",
  restrictedToController("admin"),
  validate(userIdParamSchema, "params"),
  impersonateController,
);

export default router;
