import CatchAsync from "../Utilities/CatchAsync.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { getAllUsersService, getUserByIDService, UpdateUserByIDService, SoftDeleteUserByIDService, getMyStudentsService, createUserService } from "../Services/UserServices.js";

const getAllUsersController = CatchAsync(async (req, res, next) => {
  const docs = (await getAllUsersService(req.query)) || [];

  res.status(200).json({
    status: "success",
    data: {
      results: docs.length,
      users: docs,
    },
  });
});

const getUserController = CatchAsync(async (req, res, next) => {
  const user = await getUserByIDService(req.params.id);

  if (!user) {
    return next(new AppErrorHelper("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: user,
  });
});

const UpdateUserController = CatchAsync(async (req, res, next) => {
  const user = await UpdateUserByIDService(req.params.id, req.body);

  if (!user) {
    return next(new AppErrorHelper("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: user,
  });
});

const DeleteUserController = CatchAsync(async (req, res, next) => {
  const user = await SoftDeleteUserByIDService(req.params.id);

  if (!user) {
    return next(new AppErrorHelper("User not found", 404));
  }

  res.status(200).json({
    status: "success",
    message: "User deleted successfully !",
  });
});

const getMyStudentsController = CatchAsync(async (req, res, next) => {
  // BUG FIX: original code called getMyStudentsService(parentId) without `await`,
  // so `students` was an unresolved Promise — truthy, with no `.length` — and the
  // following `.json(students)` was serialising a Promise instead of the array.
  const students = (await getMyStudentsService(req.params.id)) || [];

  res.status(200).json({
    status: "success",
    data: students,
  });
});

const createUserController = CatchAsync(async (req, res, next) => {
  let user = { ...req.body };

  if (Object.keys(user).length === 0) {
    throw new AppErrorHelper("User data is missing while Creating !");
  }
  user = await createUserService(user);

  res.status(201).json({
    status: "success",
    data: {
      user: user,
    },
  });
});

export { getAllUsersController, createUserController, getUserController, UpdateUserController, DeleteUserController, getMyStudentsController };
