import express from "express";
import { createAssignmentController, endAssignmentController, getAssignedStudentsController, getAssignmentsController } from "../Controllers/StudentInstructorAssignmentController.js";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import { validate } from "../Middleware/validate.js";
import { adminLinkInstructorSchema } from "../Validation/studentProfileValidation.js";

const router = express.Router();

router.use(protectionController);
router.get("/me/students", restrictedToController("instructor", "admin"), getAssignedStudentsController);
router.get("/", restrictedToController("admin"), getAssignmentsController);
router.post("/", restrictedToController("admin"), validate(adminLinkInstructorSchema), createAssignmentController);
router.delete("/:assignmentId", restrictedToController("admin"), endAssignmentController);

export default router;
