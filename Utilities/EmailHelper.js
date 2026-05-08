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
