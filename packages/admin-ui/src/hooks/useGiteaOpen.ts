import { useCallback } from 'react';
import { useAuth } from '../auth-context.js';

/**
 * Returns an async function that opens a Gitea URL in a new tab.
 *
 * For http:// URLs (local installs), the admin server's autologin endpoint
 * is called first with the X-Admin-Password header so that Gitea session
 * cookies are set before the tab navigates. This avoids the 401 that would
 * occur if the browser tried to reach /api/gitea/autologin directly via an
 * <a href> (browser navigation cannot send custom headers).
 *
 * For https:// URLs (named-tunnel / external), the URL is opened directly
 * as the user is expected to authenticate through the tunnel's own flow.
 *
 * Popup-blocker note: window.open('', '_blank') is called synchronously
 * inside the click handler so the browser treats it as user-initiated.
 * The resulting window is then navigated to the final URL after auth.
 */
export function useGiteaOpen() {
  const { apiFetch } = useAuth();

  return useCallback(
    async (giteaUrl: string) => {
      if (!giteaUrl) return;

      // https:// URLs go straight to the external destination
      if (giteaUrl.startsWith('https://')) {
        window.open(giteaUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      // Open the tab immediately inside the user-gesture context so popup
      // blockers don't fire when we navigate after the async auth call.
      const win = window.open('', '_blank');

      try {
        const pathname = new URL(giteaUrl).pathname;
        await apiFetch(
          `/api/gitea/autologin?redirect=${encodeURIComponent(pathname)}`,
          { redirect: 'follow', credentials: 'same-origin' },
        );
        // fetch followed the 302 and processed the Set-Cookie headers;
        // Gitea session cookies are now in the browser's cookie jar.
      } catch {
        // autologin failed — Gitea will show its own login page
      }

      if (win) {
        win.location.href = giteaUrl;
      }
    },
    [apiFetch],
  );
}
