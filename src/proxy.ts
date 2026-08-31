import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Always allow static files & next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Check Authentication
  let isAuthenticated = false;

  // Check custom session token
  const sessionToken = request.cookies.get("crm_user_session")?.value;
  if (sessionToken) {
    const payload = await verifySessionToken(sessionToken);
    if (payload) {
      isAuthenticated = true;
    }
  }

  // If not authenticated via custom session, check Supabase auth
  if (!isAuthenticated) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) =>
                request.cookies.set(name, value)
              );
            },
          },
        }
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        isAuthenticated = true;
      }
    } catch {
      isAuthenticated = false;
    }
  }

  // 3. Handle Public Paths
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  // If already logged in and visiting /login -> redirect to home / CRM
  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // If on a public path (e.g. /login or /api/auth/login) -> allow
  if (isPublicPath) {
    return NextResponse.next();
  }

  // 4. Block Unauthenticated Access (NO BREAKOUT POSSIBLE)
  if (!isAuthenticated) {
    // If requesting an API route -> return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Nicht autorisiert. Bitte zuerst einloggen." },
        { status: 401 }
      );
    }

    // If requesting any page -> hard redirect to /login
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
