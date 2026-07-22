import Channel from "../Models/Channel.js";
import StudentProfile from "../Models/studentProfile.js";
import User from "../Models/user.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

const hasDirectParentStudentRelationship = async (firstUser, secondUser) => {
  const student = firstUser.role === "student" ? firstUser : secondUser.role === "student" ? secondUser : null;
  const parent = firstUser.role === "parent" ? firstUser : secondUser.role === "parent" ? secondUser : null;
  if (!student || !parent) return false;

  return Boolean(
    await StudentProfile.exists({
      user: student._id,
      parents: parent._id,
    }),
  );
};

const assertUsersCanMessage = async (firstUserId, secondUserId) => {
  const [firstUser, secondUser] = await Promise.all([User.findById(firstUserId), User.findById(secondUserId)]);

  if (!firstUser || !secondUser) {
    throw new AppErrorHelper("User not found or inactive", 404);
  }
  if (firstUser._id.toString() === secondUser._id.toString()) {
    throw new AppErrorHelper("You cannot message yourself", 400);
  }
  if (firstUser.role === "admin" || secondUser.role === "admin") {
    return { firstUser, secondUser };
  }

  const [sharedChannel, parentStudentRelationship] = await Promise.all([
    Channel.exists({
      status: "active",
      members: {
        $all: [{ $elemMatch: { userId: firstUser._id } }, { $elemMatch: { userId: secondUser._id } }],
      },
    }),
    hasDirectParentStudentRelationship(firstUser, secondUser),
  ]);

  if (!sharedChannel && !parentStudentRelationship) {
    throw new AppErrorHelper("You can only message members of your learning team", 403);
  }

  return { firstUser, secondUser };
};

export { assertUsersCanMessage };
