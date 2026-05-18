"use client";

import { useEffect } from "react";

/**
 * Registers the offline-first service worker (public/sw.js). Production only —
 * a service worker in dev just gets in the way of HMR. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed SW registration must never break the app.
      });
    }
  }, []);

  return null;
}
