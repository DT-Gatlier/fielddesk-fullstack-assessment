import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../utils/password";
import { generateAccessToken } from "./jwt";

export class AuthenticationError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "AuthenticationError";
  }
}

export const login = async (
  email: string,
  password: string,
) => {
  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (!user) {
    throw new AuthenticationError();
  }

  const passwordValid = await verifyPassword(
    password,
    user.passwordHash,
  );

  if (!passwordValid) {
    throw new AuthenticationError();
  }

  const token = generateAccessToken({
    sub: user.id,
    organisationId: user.organisationId,
    role: user.role,
  });

  return {
    token,

    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
    },
  };
};