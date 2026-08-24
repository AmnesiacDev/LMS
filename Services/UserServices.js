import User from "../Models/user.js";
import Token from "../Models/Token.js";
import ApiFeatures from "../Utilities/ApiFeatures.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";

// Admin only
const getAllUsersService = async (query) => {
  const features = new ApiFeatures(User.find({}), query).filter().sort().fields().pagination();
  const users = await features.mongooseQuery;

  return users;
};

const getUserByIDService = async (id) => {
  const user = await User.findById(id);
  return user;
};

// Fields an admin is allowed to change through PATCH /api/v1/user/:id.
// Anything else in the body is ignored, so the endpoint cannot be used to
// write internal state (approvalStatus, apiKeyHash, reset tokens, ...).
const ADMIN_UPDATABLE_FIELDS = ["FullName", "UserName", "Email", "role", "avatar", "isActive"];

const UpdateUserByIDService = async (id, data = {}) => {
  // findByIdAndUpdate does NOT run the schema's pre("save") hook, so updating
  // through it wrote the new password to the database in plaintext. Load the
  // document and save() it instead: the hook hashes the password on the way in.
  // +password so the document is complete on save(). The hook only re-hashes
  // when the path is actually modified, so loading it is safe.
  const user = await User.findById(id).select("+password").setOptions({ withInactive: true });
  if (!user) return null;

  for (const field of ADMIN_UPDATABLE_FIELDS) {
    if (data[field] !== undefined) user[field] = data[field];
  }

  const newPassword = typeof data.password === "string" ? data.password.trim() : "";
  const passwordChanged = newPassword.length > 0;

  if (passwordChanged) {
    // Assigning the plaintext marks the path modified; the pre("save") hook
    // bcrypts it before it reaches MongoDB.
    user.password = newPassword;
  }

  await user.save();

  if (passwordChanged) {
    // The old credentials are gone, so the sessions minted with them must go
    // too — otherwise a rotated password leaves every existing login alive.
    await Token.deleteMany({ userId: user._id });
  }

  user.password = undefined;
  return user;
};
const SoftDeleteUserByIDService = async (id) => {
  const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true });
  return user;
};
const createUserService = async (data) => {
  const user = { ...data };

  return await User.create({
    FullName: user.FullName,
    UserName: user.UserName,
    Email: user.Email,
    password: user.password,
    role: user.role,
    avatar: user.avatar,
    isActive: user.isActive,
    approvalStatus: "approved",
  });
};

const getPendingApprovalUsersService = async () =>
  User.find({
    role: { $in: ["student", "parent"] },
    approvalStatus: "pending",
  }).sort({ createdAt: -1 });

const reviewUserApprovalService = async ({ userId, approvalStatus, rejectionReason, reviewedBy }) => {
  if (!reviewedBy || reviewedBy.role !== "admin") {
    throw new AppErrorHelper("Only admins can review account approvals", 403);
  }

  if (!["approved", "rejected"].includes(approvalStatus)) {
    throw new AppErrorHelper("Approval status must be approved or rejected", 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppErrorHelper("User not found", 404);

  if (!["student", "parent"].includes(user.role)) {
    throw new AppErrorHelper("Only parent and student accounts need approval", 400);
  }

  user.approvalStatus = approvalStatus;
  user.approvalReviewedBy = reviewedBy._id;
  user.approvalReviewedAt = new Date();
  const cleanedRejectionReason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";

  user.rejectionReason = approvalStatus === "rejected" ? cleanedRejectionReason || undefined : undefined;
  await user.save();

  if (approvalStatus === "rejected") {
    await Token.deleteMany({ userId: user._id });
  }

  return user;
};

// parent

const getMyStudentsService = async (parentID) => {
  const students = StudentProfile.find({ parents: parentID }).populate("user");

  return students;
};

export {
  getAllUsersService,
  getUserByIDService,
  UpdateUserByIDService,
  SoftDeleteUserByIDService,
  createUserService,
  getPendingApprovalUsersService,
  reviewUserApprovalService,
  // Parent
  getMyStudentsService,
};
