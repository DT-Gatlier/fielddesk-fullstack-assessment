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

function randomScheduleSalt(): number {
  return parseInt(crypto.randomUUID().replace(/-/g, "").slice(0, 12), 16) % 50_000_000;
}

/** Far-future window unique per test run — avoids collisions with seed data or prior runs. */
export function uniqueScheduleWindow(
  salt?: number,
  durationMinutes = 120,
): { scheduledStart: string; scheduledEnd: string } {
  const minutes = salt ?? randomScheduleSalt();
  const start = new Date(Date.UTC(2090, 0, 1, 0, 0, 0) + minutes * 60_000);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
  };
}
