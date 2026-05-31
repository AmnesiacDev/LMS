import jwt from "jsonwebtoken";

const signAccessToken = (user) => {
  const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_TOKEN_SECRET, { expiresIn: process.env.JWT_TOKEN_EXPIRES_IN || "30m" });
  return accessToken;
};
const signRefreshToken = (user, tokenId = null) => {
  const refreshToken = jwt.sign({ userId: user._id, tokenId: tokenId }, process.env.JWT_REFRESH_TOKEN_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" });
  return refreshToken;
};

const generateToken = (user, tokenId = null) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, tokenId);
  return { accessToken, refreshToken };
};

// Short-lived access token used when an admin impersonates another user.
// Carries an `impersonator` claim so downstream code (audit, RBAC) can
// distinguish it from a real session, and is capped at 15 minutes.
const signImpersonationToken = (targetUser, impersonatorId) => {
  return jwt.sign(
    { id: targetUser._id, role: targetUser.role, impersonator: impersonatorId, imp: true },
    process.env.JWT_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
};

const verifyAccessToken = (accessToken) => {
  return jwt.verify(accessToken, process.env.JWT_TOKEN_SECRET);
};
const verifyRefreshToken = (refreshToken) => {
  return jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN_SECRET);
};

export { generateToken, verifyAccessToken, verifyRefreshToken, signImpersonationToken };
