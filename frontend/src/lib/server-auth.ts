export async function proxyToBackend(
  endpoint: string,
  method: string,
  body?: unknown,
  cookies?: string
): Promise<Response | null> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL || "http://localhost:4000"}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  } catch {
    return null;
  }
}
