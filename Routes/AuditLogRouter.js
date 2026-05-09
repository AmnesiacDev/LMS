import express from "express";
import AuditLog from "../Models/AuditLog.js";
import CatchAsync from "../Utilities/CatchAsync.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import { protectionController, restrictedToController } from "../Controllers/AuthController.js";

const router = express.Router();

router.use(protectionController, restrictedToController("admin"));

router.get("/", CatchAsync(async (req, res) => {
  const features = new ApiFeatures(
    AuditLog.find({}).populate("actor", "FullName Email role"),
    req.query
  ).filter().sort().pagination();

  const logs = await features.mongooseQuery;
  res.status(200).json({ status: "success", results: logs.length, data: { logs } });
}));

export default router;
