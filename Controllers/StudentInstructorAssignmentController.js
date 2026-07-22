import CatchAsync from "../Utilities/CatchAsync.js";
import { assignInstructorService, getAssignedStudentProfilesService, getAssignmentsService, unassignInstructorByIdService } from "../Services/StudentInstructorAssignmentService.js";

const createAssignmentController = CatchAsync(async (req, res) => {
  const result = await assignInstructorService({
    studentUserId: req.body.studentUserId,
    instructorUserId: req.body.instructorUserId,
    assignedBy: req.user,
  });

  res.status(201).json({
    status: "success",
    message: "Instructor assigned and learning-team channel created",
    data: result,
  });
});

const getAssignmentsController = CatchAsync(async (req, res) => {
  const assignments = await getAssignmentsService(req.user, {
    includeEnded: req.query.includeEnded === "true",
  });

  res.status(200).json({
    status: "success",
    results: assignments.length,
    data: { assignments },
  });
});

const getAssignedStudentsController = CatchAsync(async (req, res) => {
  const students = await getAssignedStudentProfilesService(req.user);

  res.status(200).json({
    status: "success",
    results: students.length,
    data: { students },
  });
});

const endAssignmentController = CatchAsync(async (req, res) => {
  const assignment = await unassignInstructorByIdService(req.params.assignmentId, req.user);

  res.status(200).json({
    status: "success",
    message: "Instructor assignment ended and channel archived",
    data: { assignment },
  });
});

export { createAssignmentController, endAssignmentController, getAssignedStudentsController, getAssignmentsController };
