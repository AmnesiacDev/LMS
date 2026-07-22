import StudentInstructorAssignment from "../Models/StudentInstructorAssignment.js";
import StudentProfile from "../Models/studentProfile.js";
import Channel from "../Models/Channel.js";
import User from "../Models/user.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { archiveLearningTeamChannelForAssignment, createLearningTeamChannelForAssignment } from "./ChannelService.js";

const assignmentPopulation = [
  {
    path: "studentProfileId",
    populate: { path: "user", select: "FullName UserName Email avatar role" },
  },
  { path: "instructorId", select: "FullName UserName Email avatar role" },
  { path: "assignedBy", select: "FullName UserName Email role" },
];

const assertAdmin = (user) => {
  if (!user || user.role !== "admin") {
    throw new AppErrorHelper("Only admins can manage instructor assignments", 403);
  }
};

const getStudentAndInstructor = async (studentUserId, instructorUserId) => {
  const [student, instructor] = await Promise.all([User.findOne({ _id: studentUserId, role: "student" }), User.findOne({ _id: instructorUserId, role: "instructor" })]);

  if (!student) throw new AppErrorHelper("Student user not found", 404);
  if (!instructor) throw new AppErrorHelper("Instructor user not found", 404);

  let profile = await StudentProfile.findOne({ user: student._id });
  if (!profile) {
    profile = await StudentProfile.create({ user: student._id });
  }
  return { profile, instructor };
};

const assignInstructorService = async ({ studentUserId, instructorUserId, assignedBy }) => {
  assertAdmin(assignedBy);
  const { profile, instructor } = await getStudentAndInstructor(studentUserId, instructorUserId);

  const existing = await StudentInstructorAssignment.findOne({
    studentProfileId: profile._id,
    instructorId: instructor._id,
    status: "active",
  });
  if (existing) {
    throw new AppErrorHelper("This instructor is already assigned to the student", 409);
  }

  let assignment;
  try {
    assignment = await StudentInstructorAssignment.create({
      studentProfileId: profile._id,
      instructorId: instructor._id,
      assignedBy: assignedBy._id,
      source: "admin",
    });
    await StudentProfile.updateOne({ _id: profile._id }, { $addToSet: { instructors: instructor._id } });
    const channel = await createLearningTeamChannelForAssignment(assignment, profile);
    const populatedAssignment = await StudentInstructorAssignment.findById(assignment._id).populate(assignmentPopulation);
    return { assignment: populatedAssignment, channel };
  } catch (error) {
    if (assignment?._id) {
      await Promise.allSettled([StudentInstructorAssignment.deleteOne({ _id: assignment._id }), StudentProfile.updateOne({ _id: profile._id }, { $pull: { instructors: instructor._id } }), Channel.deleteOne({ assignmentId: assignment._id })]);
    }
    if (error?.code === 11000) {
      throw new AppErrorHelper("This instructor is already assigned to the student", 409);
    }
    throw error;
  }
};

const unassignInstructorService = async ({ studentUserId, instructorUserId, endedBy }) => {
  assertAdmin(endedBy);
  const { profile, instructor } = await getStudentAndInstructor(studentUserId, instructorUserId);
  const assignment = await StudentInstructorAssignment.findOneAndUpdate(
    {
      studentProfileId: profile._id,
      instructorId: instructor._id,
      status: "active",
    },
    {
      status: "ended",
      endedAt: new Date(),
      endedBy: endedBy._id,
    },
    { returnDocument: "after" },
  );

  if (!assignment) throw new AppErrorHelper("Active instructor assignment not found", 404);

  await Promise.all([StudentProfile.updateOne({ _id: profile._id }, { $pull: { instructors: instructor._id } }), archiveLearningTeamChannelForAssignment(assignment._id, endedBy._id)]);

  return StudentInstructorAssignment.findById(assignment._id).populate(assignmentPopulation);
};

const unassignInstructorByIdService = async (assignmentId, endedBy) => {
  assertAdmin(endedBy);
  const assignment = await StudentInstructorAssignment.findOne({
    _id: assignmentId,
    status: "active",
  }).populate({
    path: "studentProfileId",
    select: "user",
  });

  if (!assignment) throw new AppErrorHelper("Active instructor assignment not found", 404);

  return unassignInstructorService({
    studentUserId: assignment.studentProfileId.user?._id || assignment.studentProfileId.user,
    instructorUserId: assignment.instructorId,
    endedBy,
  });
};

const isInstructorAssignedToProfile = async (instructorId, studentProfileId) =>
  Boolean(
    await StudentInstructorAssignment.exists({
      instructorId,
      studentProfileId,
      status: "active",
    }),
  );

const assertInstructorAssignedToProfile = async (instructorId, studentProfileId) => {
  if (!(await isInstructorAssignedToProfile(instructorId, studentProfileId))) {
    throw new AppErrorHelper("Instructor is not assigned to this student", 403);
  }
};

const getAssignedStudentProfilesService = async (user) => {
  if (!user || !["instructor", "admin"].includes(user.role)) {
    throw new AppErrorHelper("Not allowed", 403);
  }
  if (user.role === "admin") return StudentProfile.find({});

  const profileIds = await StudentInstructorAssignment.distinct("studentProfileId", {
    instructorId: user._id,
    status: "active",
  });
  if (!profileIds.length) return [];
  return StudentProfile.find({ _id: { $in: profileIds } });
};

const getAssignmentsService = async (user, { includeEnded = false } = {}) => {
  assertAdmin(user);
  const filter = includeEnded ? {} : { status: "active" };
  return StudentInstructorAssignment.find(filter).sort({ assignedAt: -1 }).populate(assignmentPopulation);
};

export { assignInstructorService, assertInstructorAssignedToProfile, getAssignedStudentProfilesService, getAssignmentsService, isInstructorAssignedToProfile, unassignInstructorService, unassignInstructorByIdService };
