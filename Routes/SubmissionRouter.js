import express from "express";
import multer from "multer";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";

import {
  createSubmissionController,
  getAllSubmissionsController,
  getSubmissionByIdController,
  getSubmissionsByTaskIdController,
  getSubmissionsByStudentIdController,
  getAllMySubmissionsController,
  getMySubmissionController,
  getMySubmissionStatsController,
  getSubmissionStatsByStudentIdController,
  getTasksDueDateBucketsController,
  updateSubmissionByIdController,
  deleteSubmissionByIdController,
  updateSubmissionStatusController,
  submitTaskController,
  reviewSubmissionController,
  uploadSubmissionFilesController,
  deleteSubmissionFileController,
} from "../Controllers/SubmissionController.js";

// multer with memory storage — buffers go straight to Cloudinary, nothing lands on disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp)|application\/pdf|video\//;
    cb(null, allowed.test(file.mimetype));
  },
});

const router = express.Router();

// All routes require authentication
router.use(protectionController);

// ─── Authenticated (any logged-in user) ──────────────────────────────────────


router.get("/", getAllSubmissionsController);


router.get("/task/:taskId", getSubmissionsByTaskIdController);

router.get("/me", getAllMySubmissionsController);
router.get("/me/stats", getMySubmissionStatsController);
router.get("/me/:id", getMySubmissionController);

router.get("/student/:studentId/stats", getSubmissionStatsByStudentIdController);


router.get("/student/:studentId/due-buckets", getTasksDueDateBucketsController);

router.get("/student/:studentId", getSubmissionsByStudentIdController);

router.get("/:id", getSubmissionByIdController);


router.patch("/:id/submit", submitTaskController);

router.post("/", createSubmissionController);

// ─── Restricted (instructor / admin only) ────────────────────────────────────

router.use(restrictedToController("admin", "instructor"));



router.patch("/:id", updateSubmissionByIdController);


router.patch("/:id/status", updateSubmissionStatusController);

 
router.patch("/:id/review", reviewSubmissionController);

router.delete("/:id", deleteSubmissionByIdController);

// ─── File uploads ────────────────────────────────────────────────────────────
// POST /submission/:id/files  — upload up to 5 files (student or instructor)
router.post("/:id/files", upload.array("files", 5), uploadSubmissionFilesController);
// DELETE /submission/:id/files?publicId=submissions/abc123
router.delete("/:id/files", deleteSubmissionFileController);

export default router;
