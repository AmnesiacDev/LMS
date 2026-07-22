import "dotenv/config";
import mongoose from "mongoose";
import StudentProfile from "../Models/studentProfile.js";
import User from "../Models/user.js";
import StudentInstructorAssignment from "../Models/StudentInstructorAssignment.js";
import { createLearningTeamChannelForAssignment } from "../Services/ChannelService.js";

if (!process.env.CONNECTION_STRING) {
  throw new Error("CONNECTION_STRING is required");
}

await mongoose.connect(process.env.CONNECTION_STRING);

let created = 0;
let skipped = 0;
let invalid = 0;

try {
  const profiles = await StudentProfile.find({
    instructors: { $exists: true, $ne: [] },
  }).populate("user parents");

  for (const profile of profiles) {
    for (const instructorValue of profile.instructors || []) {
      const instructorId = instructorValue?._id || instructorValue;
      const validInstructor = await User.exists({
        _id: instructorId,
        role: "instructor",
      });
      if (!validInstructor) {
        invalid += 1;
        continue;
      }

      let assignment = await StudentInstructorAssignment.findOne({
        studentProfileId: profile._id,
        instructorId,
        status: "active",
      });

      if (!assignment) {
        assignment = await StudentInstructorAssignment.create({
          studentProfileId: profile._id,
          instructorId,
          source: "migration",
        });
        created += 1;
      } else {
        skipped += 1;
      }

      await createLearningTeamChannelForAssignment(assignment, profile);
    }
  }

  console.log(
    `Student/instructor migration complete: ${created} created, ${skipped} already active, ${invalid} invalid legacy links skipped.`,
  );
} finally {
  await mongoose.disconnect();
}
