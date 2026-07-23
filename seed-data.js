import "dotenv/config";
import mongoose from "mongoose";
import Db_Connection from "./Configs/DbConfig.js";
import StudentProfile from "./Models/studentProfile.js";
import User from "./Models/user.js";

const demoAccounts = [
  {
    FullName: "Amina Admin",
    UserName: "aminaadmin",
    Email: "admin@test.com",
    password: "Test1234!",
    role: "admin",
  },
  {
    FullName: "Ahmed Teacher",
    UserName: "ahmedteacher",
    Email: "ahmed.teacher@test.com",
    password: "Test1234!",
    role: "instructor",
  },
  {
    FullName: "Sara Instructor",
    UserName: "sarainstructor",
    Email: "sara.instructor@test.com",
    password: "Test1234!",
    role: "instructor",
  },
  {
    FullName: "Emad Hassan",
    UserName: "emadhassan",
    Email: "emad@test.com",
    password: "Test1234!",
    role: "parent",
  },
  {
    FullName: "Mona Hassan",
    UserName: "monahassan",
    Email: "mona@test.com",
    password: "Test1234!",
    role: "parent",
  },
  {
    FullName: "Mahmoud Hassan",
    UserName: "mahmoudhassan",
    Email: "mahmoud@test.com",
    password: "Test1234!",
    role: "student",
  },
  {
    FullName: "Reem Hassan",
    UserName: "reemhassan",
    Email: "reem@test.com",
    password: "Test1234!",
    role: "student",
  },
  {
    FullName: "Yassin Hassan",
    UserName: "yassinhassan",
    Email: "yassin@test.com",
    password: "Test1234!",
    role: "student",
  },
  {
    FullName: "Laila Hassan",
    UserName: "lailahassan",
    Email: "laila@test.com",
    password: "Test1234!",
    role: "student",
  },
];

const studentProfiles = [
  { email: "mahmoud@test.com", grade: "Grade 8" },
  { email: "reem@test.com", grade: "Grade 6" },
  { email: "yassin@test.com", grade: "Grade 5" },
  { email: "laila@test.com", grade: "Grade 7" },
];

async function findOrCreateUser(account) {
  const existing = await User.findOne({ Email: account.Email }).setOptions({ withInactive: true });

  if (existing) {
    if (existing.role !== account.role) {
      throw new Error(`Existing user ${account.Email} has role ${existing.role}, expected ${account.role}.`);
    }
    return { user: existing, created: false };
  }

  const user = await User.create({ ...account, emailVerified: true });
  return { user, created: true };
}

async function seedBaseUsers() {
  await Db_Connection();

  try {
    const usersByEmail = new Map();
    let createdUsers = 0;

    for (const account of demoAccounts) {
      const { user, created } = await findOrCreateUser(account);
      usersByEmail.set(account.Email, user);
      createdUsers += Number(created);
    }

    let createdProfiles = 0;
    for (const definition of studentProfiles) {
      const user = usersByEmail.get(definition.email);
      const profile = await StudentProfile.findOne({ user: user._id });

      if (!profile) {
        await StudentProfile.create({
          user: user._id,
          grade: definition.grade,
          notes: "",
        });
        createdProfiles += 1;
      }
    }

    console.log(`Created ${createdUsers} demo users and ${createdProfiles} student profiles.`);
    console.log("No parent links, instructor assignments, channels, sessions, or tasks were created.");
    console.log("Create the parent links and instructor assignments in the admin dashboard first.");
    console.log("Then run: npm run seed:assigned-demo-data");
    console.log("\nDemo login password for every account: Test1234!");
    console.log("Admin: admin@test.com");
    console.log("Instructors: ahmed.teacher@test.com, sara.instructor@test.com");
    console.log("Parents: emad@test.com, mona@test.com");
    console.log("Students: mahmoud@test.com, reem@test.com, yassin@test.com, laila@test.com");
  } finally {
    await mongoose.connection.close();
  }
}

seedBaseUsers().catch((error) => {
  console.error("Base user seed failed:", error.message);
  process.exitCode = 1;
});
