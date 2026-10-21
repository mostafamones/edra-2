"use client";

import { useEffect, useRef } from "react";

/** Clears the revoked browser session by posting to sign-out, which redirects to the login page. */
export function SessionEnded() {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => form.current?.requestSubmit(), []);
  return (
    <form ref={form} action="/auth/signout" method="post">
      <p role="status">Your session has ended. Signing you out…</p>
      <noscript><button type="submit">Sign in again</button></noscript>
    </form>
  );
}
