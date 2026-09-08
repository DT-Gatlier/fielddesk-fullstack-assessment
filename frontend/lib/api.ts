const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  organisationId: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser }> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await parseJson<ApiError>(response);
    throw new Error(error.error.message);
  }

  return parseJson<{ user: AuthUser }>(response);
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getMe(): Promise<{ user: AuthUser } | null> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const error = await parseJson<ApiError>(response);
    throw new Error(error.error.message);
  }

  return parseJson<{ user: AuthUser }>(response);
}
