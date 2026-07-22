import CatchAsync from "../Utilities/CatchAsync.js";
import { getEntriesService, getWeekEntriesService, getEntryByIdService, updateEntryService, createCustomEntryService, softDeleteEntryService } from "../Services/scheduleEntryService.js";
import { createSeriesService, getSeriesForUserService, updateSeriesService, softDeleteSeriesService, getSeriesByIdService } from "../Services/scheduleSeriesService.js";

// ─── Entry Controllers ────────────────────────────────────────────────────────

const getEntriesController = CatchAsync(async (req, res, next) => {
  const entries = await getEntriesService(req.user, req.query.startDate, req.query.endDate);
  res.status(200).json({ status: "success", results: entries.length, data: { entries } });
});

const getWeekEntriesController = CatchAsync(async (req, res, next) => {
  const entries = await getWeekEntriesService(req.user);
  res.status(200).json({ status: "success", results: entries.length, data: { entries } });
});

const getEntryByIdController = CatchAsync(async (req, res, next) => {
  const entry = await getEntryByIdService(req.user, req.params.id);
  res.status(200).json({ status: "success", data: { entry } });
});

const updateEntryController = CatchAsync(async (req, res, next) => {
  const entry = await updateEntryService(req.params.id, req.body, req.user);
  res.status(200).json({ status: "success", data: { entry } });
});

const createCustomEntryController = CatchAsync(async (req, res, next) => {
  const { entry, conflicts } = await createCustomEntryService(req.body, req.user);
  res.status(201).json({ status: "success", data: { entry, conflicts } });
});

const softDeleteEntryController = CatchAsync(async (req, res, next) => {
  await softDeleteEntryService(req.params.id, req.user);
  res.status(200).json({ status: "success", message: "Schedule entry deleted" });
});

// ─── Series Controllers ───────────────────────────────────────────────────────

const createSeriesController = CatchAsync(async (req, res, next) => {
  const series = await createSeriesService(req.body, req.user);
  res.status(201).json({ status: "success", data: { series } });
});

const getSeriesController = CatchAsync(async (req, res, next) => {
  const series = await getSeriesForUserService(req.user);
  res.status(200).json({ status: "success", results: series.length, data: { series } });
});

const getSeriesByIdController = CatchAsync(async (req, res, next) => {
  const series = await getSeriesByIdService(req.user, req.params.id);
  res.status(200).json({ status: "success", data: { series } });
});

const updateSeriesController = CatchAsync(async (req, res, next) => {
  const series = await updateSeriesService(req.params.id, req.body, req.user);
  res.status(200).json({ status: "success", data: { series } });
});

const deleteSeriesController = CatchAsync(async (req, res, next) => {
  await softDeleteSeriesService(req.params.id, req.user);
  res.status(200).json({ status: "success", message: "Schedule series deleted" });
});

export {
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
};
