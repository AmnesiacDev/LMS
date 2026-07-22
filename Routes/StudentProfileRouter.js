import express from "express";
import {
  getStudentProfileController,
  updateStudentProfileController,
  createStudentProfileController,
  getMyStudentProfileController,
  getMyStudentProfileByIdController,
  getAllStudentProfileController,
  getStudentTranscriptController,
  linkChildController,
  adminLinkParentController,
  adminUnlinkParentController,
  adminLinkInstructorController,
  adminUnlinkInstructorController,
} from "../Controllers/StudentprofileController.js";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import { validate } from "../Middleware/validate.js";
import {
  createStudentProfileSchema,
  updateStudentProfileSchema,
  profileIdSchema,
  linkChildSchema,
  adminLinkParentSchema,
  adminLinkInstructorSchema,
} from "../Validation/studentProfileValidation.js";

const router = express.Router();

router.use(protectionController);

router.post("/link-child", restrictedToController("parent", "admin"), validate(linkChildSchema), linkChildController);

router.post("/admin/link-parent", restrictedToController("admin"), validate(adminLinkParentSchema), adminLinkParentController);
router.post("/admin/unlink-parent", restrictedToController("admin"), validate(adminLinkParentSchema), adminUnlinkParentController);
router.post("/admin/link-instructor", restrictedToController("admin"), validate(adminLinkInstructorSchema), adminLinkInstructorController);
router.post("/admin/unlink-instructor", restrictedToController("admin"), validate(adminLinkInstructorSchema), adminUnlinkInstructorController);

router.get("/me", restrictedToController("parent", "student"), getMyStudentProfileController);
router.get("/me/:id", restrictedToController("parent", "student"), getMyStudentProfileByIdController);
router.get("/all", restrictedToController("admin", "instructor"), getAllStudentProfileController);

// PDF transcript — admin and instructor can generate; parent can only get their child's
router.get("/:id/transcript.pdf", restrictedToController("admin", "instructor", "parent"), getStudentTranscriptController);

// Role gate is the first line of defense; the service then enforces ownership/relationship.
router.get(
  "/:id",
  restrictedToController("admin", "instructor", "parent", "student"),
  validate(profileIdSchema, "params"),
  getStudentProfileController,
);

router
  .route("/:id")
  .post(restrictedToController("parent", "student", "admin"), validate(profileIdSchema, "params"), validate(createStudentProfileSchema), createStudentProfileController)
  .patch(restrictedToController("parent", "student", "admin"), validate(profileIdSchema, "params"), validate(updateStudentProfileSchema), updateStudentProfileController);

export default router;
