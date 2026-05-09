import nodemailer from "nodemailer";

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

export const sendVerificationEmail = async ({ to, verifyUrl, userName }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Verify your email address",
    html: `
      <p>Hi ${userName},</p>
      <p>Thanks for signing up! Please verify your email address (link valid 24 hours):</p>
      <a href="${verifyUrl}" style="color:#4f46e5;font-weight:bold">Verify my email</a>
      <p>If you did not sign up, ignore this email.</p>
    `,
  });
};

export const sendWeeklySummaryEmail = async ({ to, userName, summary }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Weekly Progress Summary",
    html: `
      <p>Hi ${userName},</p>
      <h3>Weekly Summary for your child</h3>
      <ul>
        <li>Sessions this week: ${summary.sessionsThisWeek}</li>
        <li>Tasks completed: ${summary.tasksCompleted} / ${summary.tasksTotal}</li>
        <li>Attendance rate: ${summary.attendanceRate}%</li>
        <li>Upcoming sessions: ${summary.upcomingSessions}</li>
      </ul>
    `,
  });
};

export const sendSessionReminderEmail = async ({ to, userName, sessionTitle, sessionDate }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Reminder: Session "${sessionTitle}" tomorrow`,
    html: `
      <p>Hi ${userName},</p>
      <p>This is a reminder that your session <strong>${sessionTitle}</strong> is scheduled for
      <strong>${new Date(sessionDate).toLocaleString()}</strong>.</p>
    `,
  });
};

export const sendTaskReminderEmail = async ({ to, userName, taskTitle, dueDate }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Task due today: "${taskTitle}"`,
    html: `
      <p>Hi ${userName},</p>
      <p>Your task <strong>${taskTitle}</strong> is due today (${new Date(dueDate).toLocaleDateString()}).
      Please submit it as soon as possible.</p>
    `,
  });
};

export const sendPasswordResetEmail = async ({ to, resetUrl, userName }) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"LMS" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Password Reset Request",
    html: `
      <p>Hi ${userName},</p>
      <p>You requested a password reset. Click the link below (valid for 1 hour):</p>
      <a href="${resetUrl}" style="color:#4f46e5;font-weight:bold">Reset my password</a>
      <p>If you did not request this, ignore this email.</p>
    `,
  });
};
