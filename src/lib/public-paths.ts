/** Paths that stay reachable without a CRM session. The calendar feed is public because Apple Calendar cannot send an auth header; the unguessable token in the URL is the secret. */
export const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/agent",
  "/api/calendar/feed",
];

export function isPublicCrmPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}
