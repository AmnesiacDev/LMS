import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  createAnnouncementController,
  getAnnouncementsController,
  getAnnouncementByIdController,
  updateAnnouncementController,
  deleteAnnouncementController,
} from "../Controllers/AnnouncementController.js";

const router = express.Router();

router.use(protectionController);

// All authenticated users can read announcements
router.get("/", getAnnouncementsController);
router.get("/:id", getAnnouncementByIdController);

// Only instructor/admin can create, update, delete
router.use(restrictedToController("instructor", "admin"));
router.post("/", createAnnouncementController);
router.patch("/:id", updateAnnouncementController);
router.delete("/:id", deleteAnnouncementController);

export default router;
