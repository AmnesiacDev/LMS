import PDFDocument from "pdfkit";
import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import {
  getStudentProfileService,
  updateStudentProfileService,
  createStudentProfileService,
  getMyStudentProfileService,
  getMyStudentProfileServiceById,
  getAllStudentProfilesService,
  canAccessStudentProfile,
  linkChildToParentService,
  linkChildrenBulkService,
  getPendingParentRequestsService,
  acceptParentRequestService,
  rejectParentRequestService,
  adminForceLinkParentService,
  adminForceUnlinkParentService,
  adminForceLinkInstructorService,
  adminForceUnlinkInstructorService,
} from "../Services/studentProfileServices.js";
import StudentProfile from "../Models/studentProfile.js";
import Session from "../Models/Session.js";
import Exam from "../Models/exam.js";
import Task from "../Models/Task.js";
import Submission from "../Models/Submission.js";

const getMyStudentProfileController = CatchAsync(async (req, res, next) => {
  const user = req.user;

  if (!user) {
    return next(new AppErrorHelper("User not found", 404));
  }

  const profiles = await getMyStudentProfileService(user);

  res.status(200).json({
    status: "success",
    data: profiles,
  });
});

const linkChildController = CatchAsync(async (req, res, next) => {
  const { childIdentifier } = req.body;
  const profile = await linkChildToParentService(childIdentifier, req.user);

  res.status(200).json({
    status: "success",
    message: "Link request sent! Waiting for child approval.",
    data: profile,
  });
});

const linkChildrenBulkController = CatchAsync(async (req, res, next) => {
  const { childIdentifiers } = req.body;
  const result = await linkChildrenBulkService(childIdentifiers, req.user);

  res.status(200).json({
    status: "success",
    message: `Processed bulk link requests: ${result.totalLinked} sent, ${result.totalFailed} failed.`,
    data: result,
  });
});

const getPendingParentRequestsController = CatchAsync(async (req, res, next) => {
  const requests = await getPendingParentRequestsService(req.user);

  res.status(200).json({
    status: "success",
    results: requests.length,
    data: requests,
  });
});

const acceptParentRequestController = CatchAsync(async (req, res, next) => {
  const { parentId } = req.params;
  const profile = await acceptParentRequestService(parentId, req.user);

  res.status(200).json({
    status: "success",
    message: "Parent link request accepted!",
    data: profile,
  });
});

const rejectParentRequestController = CatchAsync(async (req, res, next) => {
  const { parentId } = req.params;
  const profile = await rejectParentRequestService(parentId, req.user);

  res.status(200).json({
    status: "success",
    message: "Parent link request rejected.",
    data: profile,
  });
});

const adminLinkParentController = CatchAsync(async (req, res, next) => {
  const { studentUserId, parentUserId } = req.body;
  const profile = await adminForceLinkParentService(studentUserId, parentUserId);

  res.status(200).json({
    status: "success",
    message: "Parent successfully linked to student!",
    data: profile,
  });
});

const adminUnlinkParentController = CatchAsync(async (req, res, next) => {
  const { studentUserId, parentUserId } = req.body;
  const profile = await adminForceUnlinkParentService(studentUserId, parentUserId);

  res.status(200).json({
    status: "success",
    message: "Parent successfully unlinked from student!",
    data: profile,
  });
});

const adminLinkInstructorController = CatchAsync(async (req, res, next) => {
  const { studentUserId, instructorUserId } = req.body;
  const result = await adminForceLinkInstructorService(studentUserId, instructorUserId, req.user);

  res.status(200).json({
    status: "success",
    message: "Instructor successfully assigned to student!",
    data: result,
  });
});

const adminUnlinkInstructorController = CatchAsync(async (req, res, next) => {
  const { studentUserId, instructorUserId } = req.body;
  const assignment = await adminForceUnlinkInstructorService(studentUserId, instructorUserId, req.user);

  res.status(200).json({
    status: "success",
    message: "Instructor successfully unassigned from student!",
    data: assignment,
  });
});

const getMyStudentProfileByIdController = CatchAsync(async (req, res, next) => {
  const profile = await getMyStudentProfileServiceById(req.user, req.params.id);
  if (!profile) {
    return next(new AppErrorHelper("Profile not found", 404));
  }
  res.status(200).json({
    status: "success",
    data: profile,
  });
});

const getAllStudentProfileController = CatchAsync(async (req, res, next) => {
  const profiles = (await getAllStudentProfilesService(req.query, req.user)) || [];

  res.status(200).json({
    status: "success",
    result: profiles.length,
    data: { profiles },
  });
});

const updateStudentProfileController = CatchAsync(async (req, res, next) => {
  const StudentProfile = await updateStudentProfileService(req.params.id, req.body, req.user);

  res.status(200).json({
    status: "success",
    data: StudentProfile,
  });
});

const createStudentProfileController = CatchAsync(async (req, res, next) => {
  const StudentProfile = await createStudentProfileService(req.params.id, req.body, req.user);

  res.status(201).json({
    status: "success",
    data: StudentProfile,
  });
});

const getStudentProfileController = CatchAsync(async (req, res, next) => {
  const StudentProfile = await getStudentProfileService(req.params.id, req.user);

  res.status(200).json({
    status: "success",
    data: StudentProfile,
  });
});

const getStudentTranscriptController = CatchAsync(async (req, res, next) => {
  const profileId = req.params.id;

  // Authorization first — load profile and verify the caller may see it.
  // Return 404 (not 403) on mismatch so attackers can't enumerate profile IDs.
  const profile = await StudentProfile.findById(profileId).populate("user", "FullName Email UserName").lean();
  if (!profile) return next(new AppErrorHelper("Student profile not found!", 404));

  if (!(await canAccessStudentProfile(req.user, profile))) {
    return next(new AppErrorHelper("Student profile not found!", 404));
  }

  const [sessions, exams, taskStats] = await Promise.all([
    Session.find({ studentProfileId: profileId, deletedAt: null }).sort({ date: -1 }).limit(30).lean(),
    Exam.find({ studentProfileId: profileId }).sort({ date: -1 }).lean(),
    Task.aggregate([
      { $match: { studentProfileId: new (await import("mongoose")).default.Types.ObjectId(profileId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="transcript_${profileId}.pdf"`);
  doc.pipe(res);

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.fontSize(22).font("Helvetica-Bold").text("Student Transcript", { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#666")
    .text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "center" });
  doc.moveDown(1);

  // ─── Student Info ─────────────────────────────────────────────────────────
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#000").text("Student Information");
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc");
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica");
  doc.text(`Name: ${profile.user?.FullName || "N/A"}`);
  doc.text(`Username: ${profile.user?.UserName || "N/A"}`);
  doc.text(`Grade: ${profile.grade || "N/A"}`);
  doc.text(`Attendance Streak: ${profile.attendanceStreak || 0} sessions`);
  doc.text(`Longest Streak: ${profile.longestStreak || 0} sessions`);
  doc.moveDown(1);

  // ─── Attendance Summary ────────────────────────────────────────────────────
  const totalSessions = sessions.length;
  const attended = sessions.filter((s) => s.StudentAttended).length;
  const attendanceRate = totalSessions ? Math.round((attended / totalSessions) * 100) : 0;
  doc.fontSize(14).font("Helvetica-Bold").text("Attendance (Last 30 Sessions)");
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc");
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica");
  doc.text(`Total: ${totalSessions}  |  Attended: ${attended}  |  Rate: ${attendanceRate}%`);
  doc.moveDown(1);

  // ─── Exam Results ─────────────────────────────────────────────────────────
  doc.fontSize(14).font("Helvetica-Bold").text("Exam Results");
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc");
  doc.moveDown(0.3);
  if (exams.length === 0) {
    doc.fontSize(11).font("Helvetica").text("No exams recorded.");
  } else {
    exams.forEach((e) => {
      const pct = e.totalMark ? Math.round((e.score / e.totalMark) * 100) : 0;
      const passed = e.score >= e.passingMark ? "✓ Pass" : "✗ Fail";
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`${e.title} — ${e.score}/${e.totalMark} (${pct}%) ${passed}   [${new Date(e.date).toLocaleDateString("en-GB")}]`);
    });
  }
  doc.moveDown(1);

  // ─── Task Summary ─────────────────────────────────────────────────────────
  doc.fontSize(14).font("Helvetica-Bold").text("Task Summary");
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#ccc");
  doc.moveDown(0.3);
  const taskMap = Object.fromEntries(taskStats.map((s) => [s._id, s.count]));
  doc.fontSize(11).font("Helvetica");
  doc.text(`Completed: ${taskMap.completed || 0}  |  Pending: ${taskMap.pending || 0}  |  Canceled: ${taskMap.canceled || 0}`);
  doc.moveDown(1);

  doc.fontSize(9).fillColor("#999").text("This document was generated automatically by the LMS system.", { align: "center" });

  doc.end();
});

export {
  getStudentProfileController,
  updateStudentProfileController,
  createStudentProfileController,
  getMyStudentProfileController,
  getMyStudentProfileByIdController,
  getAllStudentProfileController,
  getStudentTranscriptController,
  linkChildController,
  linkChildrenBulkController,
  getPendingParentRequestsController,
  acceptParentRequestController,
  rejectParentRequestController,
  adminLinkParentController,
  adminUnlinkParentController,
  adminLinkInstructorController,
  adminUnlinkInstructorController,
};
