import mongoose from "mongoose";
import validator from "validator";
import { ComparePasswordHelper, hashPasswordHelper } from "../Utilities/HashHelper.js";

const schema = mongoose.Schema;

const userSchema = new schema(
  {
    FullName: {
      type: String,
      required: true,
      trim: true,
      validate: {
        // Unicode-aware: accepts letters from any language (Arabic, Latin, etc.)
        // plus spaces, hyphens, and apostrophes (e.g. "O'Brien", "عمر")
        validator(value) {
          return /^[\p{L}\s'\-]{2,}$/u.test(value);
        },
        message: "Invalid Name — only letters, spaces, hyphens, and apostrophes allowed",
      },
    },
    UserName: {
      type: String,
      required: true,
      maxlength: [30, "'User name must be less than 30 characters "],
      minlength: [5, "User name must be more than 3 characters "],
      unique: true,
    },
    Email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: {
        validator(value) {
          return validator.isEmail(value);
        },
        message: "Invalid Email",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      required: true,
      enum: ["instructor", "student", "parent", "admin"],
    },
    avatar: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true },
);



userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// By default hide inactive users. Pass { withInactive: true } in query options
// (e.g. Model.find({}).setOptions({ withInactive: true })) to bypass this filter
// — needed for admin tools that need to list or reactivate deactivated accounts.
userSchema.pre(/^find/, function () {
  if (!this.getOptions().withInactive) {
    this.find({ isActive: { $ne: false } });
  }
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  this.password = await hashPasswordHelper(this.password);
});

userSchema.methods.MatchUserPassword = async function (CandidatePassword) {
  return await ComparePasswordHelper(CandidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
