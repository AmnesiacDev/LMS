import PDFDocument from "pdfkit";
import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { getStudentProfileService, updateStudentProfileService, createStudentProfileService, getMyStudentProfileService, getMyStudentProfileServiceById, getAllStudentProfilesService } from "../Services/studentProfileServices.js";
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
  const profiles = (await getAllStudentProfilesService(req.query)) || [];

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

  const [profile, sessions, exams, taskStats] = await Promise.all([
    StudentProfile.findById(profileId).populate("user", "FullName Email UserName").lean(),
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

  if (!profile) return next(new AppErrorHelper("Student profile not found!", 404));

  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="transcript_${profileId}.pdf"`);
  doc.pipe(res);

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.fontSize(22).font("Helvetica-Bold").text("Student Transcript", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica").fillColor("#666")
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
      doc.fontSize(10).font("Helvetica")
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

export { getStudentProfileController, updateStudentProfileController, createStudentProfileController, getMyStudentProfileController, getMyStudentProfileByIdController, getAllStudentProfileController, getStudentTranscriptController };
