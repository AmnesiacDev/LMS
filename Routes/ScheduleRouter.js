import express from "express";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";
import {
  getEntriesController,
  getWeekEntriesController,
  getEntryByIdController,
  updateEntryController,
  createCustomEntryController,
  softDeleteEntryController,
  createSeriesController,
  getSeriesController,
  getSeriesByIdController,
  updateSeriesController,
  deleteSeriesController,
} from "../Controllers/ScheduleController.js";

const router = express.Router();
router.use(protectionController); // all routes require valid JWT

// ── Read-only routes (all authenticated roles) ──────────────────────────────
router.get("/week", getWeekEntriesController);
router.get("/series", getSeriesController);
router.get("/series/:id", getSeriesByIdController);

// ── Instructor + admin only ─────────────────────────────────────────────────
router.post("/custom", restrictedToController("instructor", "admin"), createCustomEntryController);
router.post("/series", restrictedToController("instructor", "admin"), createSeriesController);
router.patch("/series/:id", restrictedToController("instructor", "admin"), updateSeriesController);
router.delete("/series/:id", restrictedToController("instructor", "admin"), deleteSeriesController);

// ── Entry routes (/:id must come AFTER /series routes) ─────────────────────
router.get("/", getEntriesController);
router.get("/:id", getEntryByIdController);
router.patch("/:id", restrictedToController("instructor", "admin"), updateEntryController);
router.delete("/:id", restrictedToController("instructor", "admin"), softDeleteEntryController);

export default router;
