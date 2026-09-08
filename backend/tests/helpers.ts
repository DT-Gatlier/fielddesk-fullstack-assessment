type InjectResponse = {
  headers: Record<string, string | string[] | undefined>;
};

export function getSetCookieHeader(response: InjectResponse): string {
  const header = response.headers["set-cookie"];
  if (!header) {
    throw new Error("Expected Set-Cookie header");
  }
  return Array.isArray(header) ? header.join("; ") : header;
}

export function cookiePair(response: InjectResponse): string {
  return getSetCookieHeader(response).split(";")[0];
}
