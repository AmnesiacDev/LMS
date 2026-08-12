import CatchAsync from "../Utilities/CatchAsync.js";
import {
  createSessionCanvasService,
  getSessionCanvasesService,
  getMySessionCanvasesService,
  getSessionCanvasByIdService,
  updateSessionCanvasService,
  shareSessionCanvasService,
  deleteSessionCanvasService,
} from "../Services/SessionCanvasService.js";

const createSessionCanvasController = CatchAsync(async (req, res) => {
  const canvas = await createSessionCanvasService(req.body, req.user);

  res.status(201).json({
    status: "success",
    data: { canvas },
  });
});

const getSessionCanvasesController = CatchAsync(async (req, res) => {
  const docs = (await getSessionCanvasesService(req.params.sessionId, req.query, req.user)) || [];

  res.status(200).json({
    status: "success",
    data: { results: docs.length, docs },
  });
});

const getMySessionCanvasesController = CatchAsync(async (req, res) => {
  const docs = (await getMySessionCanvasesService(req.user, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: { results: docs.length, docs },
  });
});

const getSessionCanvasByIdController = CatchAsync(async (req, res) => {
  const { canvas, canEdit } = await getSessionCanvasByIdService(req.params.id, req.user);

  res.status(200).json({
    status: "success",
    // canEdit is what the client uses to decide between the editor and the
    // read-only viewer. The server enforces it independently on every write.
    data: { canvas, canEdit },
  });
});

const updateSessionCanvasController = CatchAsync(async (req, res) => {
  const canvas = await updateSessionCanvasService(req.params.id, req.body, req.user);

  res.status(200).json({
    status: "success",
    data: { canvas },
  });
});

const shareSessionCanvasController = CatchAsync(async (req, res) => {
  const canvas = await shareSessionCanvasService(req.params.id, req.body.isShared, req.user);

  res.status(200).json({
    status: "success",
    data: { canvas },
  });
});

const deleteSessionCanvasController = CatchAsync(async (req, res) => {
  await deleteSessionCanvasService(req.params.id, req.user);

  res.status(200).json({
    status: "Board deleted successfully",
  });
});

export {
  createSessionCanvasController,
  getSessionCanvasesController,
  getMySessionCanvasesController,
  getSessionCanvasByIdController,
  updateSessionCanvasController,
  shareSessionCanvasController,
  deleteSessionCanvasController,
};
