import express from "express";

import { protectionController, restrictedToController } from "../Controllers/AuthController.js";

import {
  createSessionReviewController,
  getAllSessionReviewsController,
  getAllMySessionReviewsController,
  getMySessionReviewController,
  getMySessionReviewStatsController,
  getSessionReviewsByStudentController,
  getSessionReviewsByInstructorController,
  getSessionReviewsBySessionController,
  updateSessionReviewByIdController,
  deleteSessionReviewByIdController,
  getStudentReviewStatsController,
} from "../Controllers/SessionReviewController.js";

const router = express.Router();
const staffOnly = restrictedToController("admin", "instructor");

router.use(protectionController);

router.get("/", staffOnly, getAllSessionReviewsController);

router.get("/session/:id", staffOnly, getSessionReviewsBySessionController);

router.get("/me", getAllMySessionReviewsController);
router.get("/me/stats", getMySessionReviewStatsController);
router.get("/me/:id", getMySessionReviewController);

router.use(staffOnly);

router.get("/student/:id", getSessionReviewsByStudentController);
router.get("/student/:id/stats", getStudentReviewStatsController);
router.get("/instructor/:id", getSessionReviewsByInstructorController);

router.post("/", createSessionReviewController);

router.route("/:id").patch(updateSessionReviewByIdController).delete(deleteSessionReviewByIdController);

export default router;
