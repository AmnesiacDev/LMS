// ─────────────────────────────────────────────────────────────────────────────
// Generates an AI summary for a single session and stores it on the session.
//
// This is the "Interpretation B" replacement for NotebookLM: instead of a manual
// notebook, we feed the session's own material to an LLM and cache the result on
// the document so every role (student / parent / instructor) reads the same text.
// ─────────────────────────────────────────────────────────────────────────────
import Session from "../Models/Session.js";
import StudentProfile from "../Models/studentProfile.js";
import AppErrorHelper from "../Utilities/AppErrorHelper.js";
import { chatCompletion } from "../Utilities/aiClient.js";

// Collapse the parts of a session that are worth summarizing into a plain-text
// block. We only send titles for links (never invent what's behind them).
const buildSessionContent = (session) => {
  const parts = [];
  if (session.title) parts.push(`Title: ${session.title}`);
  if (session.description) parts.push(`Description: ${session.description}`);
  if (session.notes) parts.push(`Instructor notes: ${session.notes}`);

  const recapTitles = (session.recapVideoLinks || []).map((v) => v.title).filter(Boolean);
  if (recapTitles.length) parts.push(`Recap videos: ${recapTitles.join(", ")}`);

  const attachmentTitles = (session.attachmentsLinks || []).map((a) => a.title).filter(Boolean);
  if (attachmentTitles.length) parts.push(`Attachments: ${attachmentTitles.join(", ")}`);

  return parts.join("\n");
};

const SYSTEM_PROMPT =
  "You are an assistant for a coding tutoring platform for students. " +
  "Write a concise, parent-friendly summary of a single tutoring session. " +
  "Use 3 to 5 short bullet points covering: what was taught, how the student did, " +
  "and suggested next steps. Keep it warm and clear. " +
  "Only use facts present in the provided material — never invent details.";

/**
 * Generate (or regenerate) the AI summary for a session and persist it.
 *
 * @param {string} sessionId
 * @param {object} currentUser – the authenticated user (req.user)
 * @returns {Promise<{ text: string, model: string, generatedAt: Date }>}
 */
export const generateSessionSummaryService = async (sessionId, currentUser) => {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }

  // Instructors may only summarize their own sessions; admins may summarize any.
  if (
    currentUser?.role === "instructor" &&
    session.instructorId.toString() !== currentUser._id.toString()
  ) {
    throw new AppErrorHelper("You can only summarize your own sessions", 403);
  }

  const content = buildSessionContent(session);
  if (content.replace(/\s/g, "").length < 30) {
    throw new AppErrorHelper(
      "This session has too little content to summarize. Add a description or notes first.",
      400,
    );
  }

  const { text, model } = await chatCompletion({
    system: SYSTEM_PROMPT,
    user: `Summarize the following session for the student's parents:\n\n${content}`,
    maxTokens: 500,
  });

  session.aiSummary = { text, model, generatedAt: new Date() };
  await session.save();

  return session.aiSummary;
};

// Decide whether a user is allowed to VIEW a session's summary.
// Read access is scoped by role: students/parents only their own; instructors
// their own; admins anything. Returns true/false (no side effects).
const canUserViewSession = async (session, currentUser) => {
  const role = currentUser?.role;

  if (role === "admin") return true;

  if (role === "instructor") {
    return session.instructorId.toString() === currentUser._id.toString();
  }

  if (role === "student") {
    const profile = await StudentProfile.findOne({ user: currentUser._id }, { _id: 1 });
    return Boolean(profile) && session.studentProfileId.toString() === profile._id.toString();
  }

  if (role === "parent") {
    const children = await StudentProfile.find({ parents: currentUser._id }, { _id: 1 });
    return children.some((child) => child._id.toString() === session.studentProfileId.toString());
  }

  return false;
};

/**
 * Read-only fetch of a session's AI summary, scoped to who is allowed to see it.
 * Students/parents can only read their own; this never creates or changes data.
 *
 * @param {string} sessionId
 * @param {object} currentUser – the authenticated user (req.user)
 * @returns {Promise<{ text: string, model: string, generatedAt: Date }>}
 */
export const getSessionAiSummaryService = async (sessionId, currentUser) => {
  const session = await Session.findById(sessionId).select("aiSummary studentProfileId instructorId");
  if (!session) {
    throw new AppErrorHelper("Session not found!", 404);
  }

  const allowed = await canUserViewSession(session, currentUser);
  if (!allowed) {
    throw new AppErrorHelper("You are not allowed to view this summary", 403);
  }

  if (!session.aiSummary || !session.aiSummary.text) {
    throw new AppErrorHelper("No summary has been generated for this session yet", 404);
  }

  return session.aiSummary;
};

export default generateSessionSummaryService;
