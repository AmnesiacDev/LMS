import { jest } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import User from "../Models/user.js";
import StudentProfile from "../Models/studentProfile.js";
import Course from "../Models/Course.js";
import Lesson from "../Models/Lesson.js";
import LessonProgress from "../Models/LessonProgress.js";
import Gamification from "../Models/Gamification.js";

jest.setTimeout(15_000);

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_TOKEN_SECRET: "test-secret-32-characters-long!!",
  JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret-32-characters!",
  JWT_TOKEN_EXPIRES_IN: "2h",
  JWT_REFRESH_EXPIRES_IN: "7d",
  SALT_ROUNDS: "4",
  CLIENT_URL: "http://localhost:5173",
});

let mongod;
let app;
let studentToken;
let studentCookie;
let studentProfileId;
let courseId;
let lessonId;

beforeAll(async () => {
  ({ default: app } = await import("../App.js"));
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  // Clean up DB
  await User.deleteMany({});
  await StudentProfile.deleteMany({});
  await Course.deleteMany({});
  await Lesson.deleteMany({});
  await LessonProgress.deleteMany({});
  await Gamification.deleteMany({});

  // 1. Create student user
  const user = await User.create({
    FullName: "Reem Hassan",
    UserName: "reemhassan",
    Email: "reem@test.com",
    password: "Password123!",
    role: "student",
    emailVerified: true,
  });

  // 2. Create student profile
  const profile = await StudentProfile.create({
    user: user._id,
    grade: "Grade 6",
  });
  studentProfileId = profile._id;

  // 3. Create gamification profile
  await Gamification.create({
    studentProfileId,
    xp: 0,
    level: 1,
  });

  // 4. Log in student to get tokens & cookies
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email: "reem@test.com", password: "Password123!" });

  studentToken = loginRes.body.data.token;
  studentCookie = loginRes.headers["set-cookie"];

  // 5. Seed a course
  const course = await Course.create({
    title: "Python Basics",
    description: "Introductory Python course",
    gradeLevel: "Grade 6",
    difficulty: "easy",
  });
  courseId = course._id;

  // 6. Seed a lesson
  const lesson = await Lesson.create({
    courseId,
    moduleTitle: "Variables",
    title: "Intro to Variables",
    order: 1,
    xpReward: 15,
    pages: [
      {
        type: "text",
        title: "Lesson Text",
        text: "Variables are containers for storing data.",
      },
      {
        type: "mini_quiz",
        title: "Variables Quiz",
        quizData: {
          question: "What is a variable?",
          options: ["a box", "nothing"],
          correctAnswer: "a box",
        },
      },
    ],
  });
  lessonId = lesson._id;
});

describe("Curriculum & Progress Endpoints", () => {
  describe("GET /api/v1/curriculum/courses", () => {
    it("returns 200 and lists active courses with completion stats", async () => {
      const res = await request(app).get("/api/v1/curriculum/courses").set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.results).toBe(1);
      expect(res.body.data[0].totalLessons).toBe(1);
      expect(res.body.data[0].completedLessons).toBe(0);
      expect(res.body.data[0].percentComplete).toBe(0);
      expect(res.body.data[0].modules[0].title).toBe("Variables");
    });
  });

  describe("GET /api/v1/curriculum/lessons/:id", () => {
    it("returns 200, lesson pages, and status", async () => {
      const res = await request(app).get(`/api/v1/curriculum/lessons/${lessonId}`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.title).toBe("Intro to Variables");
      expect(res.body.data.pages.length).toBe(2);
      // Verify correct answer is deleted/sanitized for uncompleted lesson quizzes
      expect(res.body.data.pages[1].quizData.correctAnswer).toBeUndefined();
    });

    it("returns 404 for nonexistent lesson ID", async () => {
      const invalidId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/v1/curriculum/lessons/${invalidId}`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/curriculum/lessons/:id/complete", () => {
    it("returns 200, updates progress, and awards XP", async () => {
      const res = await request(app).post(`/api/v1/curriculum/lessons/${lessonId}/complete`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`).send({ quizScore: 100 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.progress.completed).toBe(true);
      expect(res.body.data.progress.quizScore).toBe(100);
      expect(res.body.data.xpAwarded).toBe(15);

      // Verify the correct answer is now visible when reading the lesson details
      const lessonRes = await request(app).get(`/api/v1/curriculum/lessons/${lessonId}`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`);

      expect(lessonRes.status).toBe(200);
      expect(lessonRes.body.data.pages[1].quizData.correctAnswer).toBe("a box");

      // Verify gamification profile XP was updated
      const gamification = await Gamification.findOne({ studentProfileId });
      expect(gamification.xp).toBe(15);
    });

    it("does not award XP again if already completed", async () => {
      // First completion
      await request(app).post(`/api/v1/curriculum/lessons/${lessonId}/complete`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`).send({ quizScore: 80 });

      // Second completion
      const res = await request(app).post(`/api/v1/curriculum/lessons/${lessonId}/complete`).set("Cookie", studentCookie).set("Authorization", `Bearer ${studentToken}`).send({ quizScore: 100 });

      expect(res.status).toBe(200);
      expect(res.body.data.xpAwarded).toBe(0); // 0 XP awarded since it was already completed
      expect(res.body.data.progress.quizScore).toBe(100); // Updated to higher score
    });
  });
});
