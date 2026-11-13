import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { LoginInput } from "./auth.validation";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be configured with at least 32 characters");
  return secret;
};

export class AuthService {
  async login(input: LoginInput) {
    const { email, password, organisationId } = input;

    const user = await prisma.user.findFirst({
      where: organisationId
        ? { email, organisationId }
        : { email },
      include: {
        // Keep BigInt storage counters out of the JSON response. They cannot
        // be serialized by JSON.stringify and would turn a valid login into a 500.
        organisation: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) {
      const err: any = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    if (!user.isActive) {
      const err: any = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      const err: any = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        organisationId: user.organisationId,
        role: user.role,
      },
      getJwtSecret(),
      {
        expiresIn: "1d",
      }
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organisationId: user.organisationId,
        organisation: user.organisation,
      },
    };
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organisation: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
      organisation: user.organisation,
    };
  }
}
