import Joi from "joi";

// Validation schema for creating a student profile
export const createStudentProfileSchema = Joi.object({
  parents: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .message("Invalid parent ID format"),
    )
    .optional()
    .messages({
      "array.base": "Parents must be an array",
    }),

  grade: Joi.string().trim().min(1).max(50).optional().messages({
    "string.base": "Grade must be a string",
    "string.min": "Grade must be at least 1 character",
    "string.max": "Grade cannot exceed 50 characters",
  }),

  notes: Joi.string().trim().max(500).optional().messages({
    "string.base": "Notes must be a string",
    "string.max": "Notes cannot exceed 500 characters",
  }),
});

// Validation schema for updating a student profile
export const updateStudentProfileSchema = Joi.object({
  parents: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .message("Invalid parent ID format"),
    )
    .optional()
    .messages({
      "array.base": "Parents must be an array",
    }),

  grade: Joi.string().trim().min(1).max(50).optional().messages({
    "string.base": "Grade must be a string",
    "string.min": "Grade must be at least 1 character",
    "string.max": "Grade cannot exceed 50 characters",
  }),

  notes: Joi.string().trim().max(500).optional().messages({
    "string.base": "Notes must be a string",
    "string.max": "Notes cannot exceed 500 characters",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

// Validation schema for profile ID parameter
export const profileIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid profile ID format",
      "any.required": "Profile ID is required",
    }),
});

export const linkChildSchema = Joi.object({
  childIdentifier: Joi.string().trim().min(3).required().messages({
    "string.min": "Child email or username must be at least 3 characters",
    "any.required": "Child email or username is required",
  }),
});

export const adminLinkParentSchema = Joi.object({
  studentUserId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    "string.pattern.base": "Invalid student user ID format",
    "any.required": "studentUserId is required",
  }),
  parentUserId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    "string.pattern.base": "Invalid parent user ID format",
    "any.required": "parentUserId is required",
  }),
});

export const adminLinkInstructorSchema = Joi.object({
  studentUserId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    "string.pattern.base": "Invalid student user ID format",
    "any.required": "studentUserId is required",
  }),
  instructorUserId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    "string.pattern.base": "Invalid instructor user ID format",
    "any.required": "instructorUserId is required",
  }),
});
