import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import CatchAsync from "../Utilities/CatchAsync.js";
import { createEvents } from "ics";
import {
  createSessionService,
  createBulkSessionsService,
  getMyAllSessionsService,
  getMySessionByIdService,
  getMyStudentsService,
  getAllSessionsService,
  getSessionsByInstructorService,
  getSessionByIdService,
  getSessionsByStudentService,
  UpdateSessionByIdService,
  deleteSessionByIdService,
  softDeleteSessionService,
  getCalendarSessionsService,
  getParentStudentSessionsService,
} from "../Services/sessionService.js";
import { generateSessionSummaryService, getSessionAiSummaryService } from "../Services/aiSummaryService.js";

const CreateSessionController = CatchAsync(async (req, res, next) => {
  if (!req.body) {
    return next(new AppErrorHelper("Data is missing !", 404));
  }

  const session = await createSessionService(req.body);

  res.status(201).json({
    status: "success",
    data: {
      session: session,
    },
  });
});

const getAllSessionsController = CatchAsync(async (req, res, next) => {
  const docs = (await getAllSessionsService(req.query, req.user)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getSessionByIdController = CatchAsync(async (req, res, next) => {
  const session = await getSessionByIdService(req.params.id);

  if (!session) {
    return next(new AppErrorHelper("No document found !", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      session: session,
    },
  });
});

const getSessionsByInstructorController = CatchAsync(async (req, res, next) => {
  const docs = (await getSessionsByInstructorService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const getSessionsByStudentController = CatchAsync(async (req, res, next) => {
  const docs = (await getSessionsByStudentService(req.params.id, req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
});

const UpdateSessionByIdController = CatchAsync(async (req, res, next) => {
  const session = await UpdateSessionByIdService(req.params.id, req.body);

  if (!session) {
    return next(new AppErrorHelper("No document found !", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      session: session,
    },
  });
});

const deleteSessionByIdController = CatchAsync(async (req, res, next) => {
  const session = await deleteSessionByIdService(req.params.id);

  if (!session) {
    return next(new AppErrorHelper("No document found !", 404));
  }

  res.status(200).json({
    status: "Document deleted successfully",
  });
});

const getMyAllSessionController = CatchAsync(async (req,res,next)=>{

  const docs = (await getMyAllSessionsService(req.user,req.query)) || [];

 res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      docs: docs,
    },
  });
})

const getMySessionByIdController = CatchAsync(async (req,res,next)=>{


  const session = await getMySessionByIdService(req.user,req.params.id);

  if(!session ){
    throw new AppErrorHelper("No Data Found !" , 404);
  }

 res.status(200).json({
    status: "success",
    data: {
      session: session,
    },
  });
})




const getMyStudentsController = CatchAsync(async (req, res) => {
  const students = await getMyStudentsService(req.user);

  res.status(200).json({
    status: "success",
    results: students.length,
    data: {
      students,
    },
  });
});

const softDeleteSessionController = CatchAsync(async (req, res) => {
  await softDeleteSessionService(req.params.id);
  res.status(200).json({ status: "success", message: "Session soft-deleted" });
});

const getCalendarController = CatchAsync(async (req, res) => {
  const sessions = await getCalendarSessionsService(req.user);

  const events = sessions.map((s) => {
    const d = new Date(s.date);
    return {
      title: s.title,
      description: s.description || "",
      start: [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()],
      duration: { hours: 1 },
    };
  });

  const { error, value } = createEvents(events);
  if (error) throw new AppErrorHelper("Failed to generate calendar", 500);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sessions.ics"');
  res.status(200).send(value);
});

const getParentStudentSessionsController = CatchAsync(async (req, res) => {
  const docs = await getParentStudentSessionsService(req.user._id, req.params.studentProfileId, req.query);
  res.status(200).json({ status: "success", results: docs.length, data: { sessions: docs } });
});

const generateSessionAiSummaryController = CatchAsync(async (req, res) => {
  const aiSummary = await generateSessionSummaryService(req.params.id, req.user);
  res.status(200).json({
    status: "success",
    data: {
      aiSummary,
    },
  });
});

const getSessionAiSummaryController = CatchAsync(async (req, res) => {
  const aiSummary = await getSessionAiSummaryService(req.params.id, req.user);
  res.status(200).json({
    status: "success",
    data: {
      aiSummary,
    },
  });
});

const createBulkSessionsController = CatchAsync(async (req, res) => {
  const sessions = await createBulkSessionsService({
    ...req.body,
    instructorId: req.user.role === "instructor" ? req.user._id : req.body.instructorId || req.user._id,
  });

  res.status(201).json({
    status: "success",
    results: sessions.length,
    data: {
      sessions,
    },
  });
});

export {
  deleteSessionByIdController,
  UpdateSessionByIdController,
  getSessionByIdController,
  getSessionsByStudentController,
  getSessionsByInstructorController,
  getAllSessionsController,
  CreateSessionController,
  createBulkSessionsController,
  getMySessionByIdController,
  getMyAllSessionController,
  getMyStudentsController,
  softDeleteSessionController,
  getCalendarController,
  getParentStudentSessionsController,
  generateSessionAiSummaryController,
  getSessionAiSummaryController,
};

