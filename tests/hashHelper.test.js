import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";

const { hashPasswordHelper, ComparePasswordHelper } = await import("../Utilities/HashHelper.js");

const originalNodeEnv = process.env.NODE_ENV;
const originalSaltRounds = process.env.SALT_ROUNDS;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSaltRounds === undefined) {
    delete process.env.SALT_ROUNDS;
  } else {
    process.env.SALT_ROUNDS = originalSaltRounds;
  }
});

describe("password hashing configuration", () => {
  it("uses the validated SALT_ROUNDS value as the bcrypt cost", async () => {
    process.env.NODE_ENV = "test";
    process.env.SALT_ROUNDS = "4";

    const hash = await hashPasswordHelper("correct horse battery staple");

    expect(bcrypt.getRounds(hash)).toBe(4);
    await expect(ComparePasswordHelper("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it.each([undefined, "3", "16", "not-a-number", "4.5"])("rejects an invalid bcrypt work factor (%s)", async (saltRounds) => {
    process.env.NODE_ENV = "test";
    if (saltRounds === undefined) {
      delete process.env.SALT_ROUNDS;
    } else {
      process.env.SALT_ROUNDS = saltRounds;
    }

    await expect(hashPasswordHelper("password-value")).rejects.toThrow("SALT_ROUNDS must be an integer between 4 and 15");
  });

  it("enforces a production minimum cost of 12", async () => {
    process.env.NODE_ENV = "production";
    process.env.SALT_ROUNDS = "11";

    await expect(hashPasswordHelper("password-value")).rejects.toThrow("SALT_ROUNDS must be at least 12 in production");
  });
});
