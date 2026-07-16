import express from "express";
import {
  getAllExternalHWController,
  getExternalHWByIdController,
  getMyExternalHWController,
  getMyExternalHWByIdController,
  getExternalHWByCourseController,
  createExternalHWController,
  updateExternalHWController,
  deleteExternalHWController,
  markExternalHWCompleteController,
} from "../Controllers/ExternalHwController.js";
import { protectionController as protectRoute, restrictedToController as restrictTo } from "../Controllers/AuthController.js";

const router = express.Router();
const staffOnly = restrictTo("admin", "instructor");
const homeworkManagers = restrictTo("admin", "instructor", "parent");
const scopedLearners = restrictTo("student", "parent");

// ─── All routes require authentication ────────────────────────────────
router.use(protectRoute);

router.get("/my", scopedLearners, getMyExternalHWController);
router.get("/my/:id", scopedLearners, getMyExternalHWByIdController);

router.get("/course/:courseId", staffOnly, getExternalHWByCourseController);

router.get("/", staffOnly, getAllExternalHWController);

router.post("/", homeworkManagers, createExternalHWController);

router.get("/:id", staffOnly, getExternalHWByIdController);

router.patch("/:id", homeworkManagers, updateExternalHWController);

router.delete("/:id", homeworkManagers, deleteExternalHWController);

router.patch("/:id/complete", restrictTo("student"), markExternalHWCompleteController);

export default router;
