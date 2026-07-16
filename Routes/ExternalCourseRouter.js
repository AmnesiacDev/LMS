import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  CreateExternalCourseController,
  getMyExternalCourseByIdController,
  getMyExternalCoursesController,
  getAllExternalCoursesController,
  getExternalCourseByIdController,
  getExternalCoursesByStudentController,
  updateExternalCourseController,
  deleteExternalCourseController,
} from "../Controllers/ExternalCourseController.js";

const router = express.Router();
const staffOnly = restrictedToController("admin", "instructor");
const courseManagers = restrictedToController("admin", "instructor", "parent");

router.use(protectionController);

router.get("/my-course", restrictedToController("student", "parent"), getMyExternalCoursesController);

router.get("/my-course/:id", restrictedToController("student", "parent"), getMyExternalCourseByIdController);

router.get("/", staffOnly, getAllExternalCoursesController);

router.post("/", courseManagers, CreateExternalCourseController);

router.get("/:id/student", staffOnly, getExternalCoursesByStudentController);
router.get("/:id", staffOnly, getExternalCourseByIdController);
router.patch("/:id", courseManagers, updateExternalCourseController);
router.delete("/:id", courseManagers, deleteExternalCourseController);

export default router;
