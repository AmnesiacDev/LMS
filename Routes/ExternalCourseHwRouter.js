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

// ─── All routes require authentication ────────────────────────────────
router.use(protectRoute);


router.get("/my", getMyExternalHWController);
router.get("/my/:id", getMyExternalHWByIdController);

router.get("/course/:courseId", getExternalHWByCourseController);


router.get("/", restrictTo("admin", "instructor"), getAllExternalHWController);


router.post("/", restrictTo("admin", "instructor", "parent"), createExternalHWController);


router.get("/:id", getExternalHWByIdController);


router.patch("/:id", restrictTo("admin", "instructor", "parent"), updateExternalHWController);


router.delete("/:id", restrictTo("admin", "instructor", "parent"), deleteExternalHWController);


router.patch("/:id/complete", restrictTo("student"), markExternalHWCompleteController);

export default router;
