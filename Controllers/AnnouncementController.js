import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import {
  createAnnouncementService,
  getAnnouncementsService,
  getAnnouncementByIdService,
  updateAnnouncementService,
  deleteAnnouncementService,
} from "../Services/AnnouncementService.js";

export const createAnnouncementController = CatchAsync(async (req, res) => {
  const doc = await createAnnouncementService(req.body, req.user._id);
  res.status(201).json({ status: "success", data: { announcement: doc } });
});

export const getAnnouncementsController = CatchAsync(async (req, res) => {
  const docs = await getAnnouncementsService(req.user, req.query);
  res.status(200).json({ status: "success", results: docs.length, data: { announcements: docs } });
});

export const getAnnouncementByIdController = CatchAsync(async (req, res) => {
  const doc = await getAnnouncementByIdService(req.params.id);
  res.status(200).json({ status: "success", data: { announcement: doc } });
});

export const updateAnnouncementController = CatchAsync(async (req, res) => {
  const doc = await updateAnnouncementService(req.params.id, req.body);
  res.status(200).json({ status: "success", data: { announcement: doc } });
});

export const deleteAnnouncementController = CatchAsync(async (req, res) => {
  await deleteAnnouncementService(req.params.id);
  res.status(204).json({ status: "success", data: null });
});
