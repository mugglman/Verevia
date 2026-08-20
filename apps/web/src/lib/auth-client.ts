import { createAuthClient } from "better-auth/react";

/**
 * Real better-auth browser client against apps/api — no mock
 * authentication. Session cookies are set by the API's own domain but
 * (browsers scope cookies by registrable domain, not port) remain visible
 * to same-site fetches from apps/web during local development.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});
