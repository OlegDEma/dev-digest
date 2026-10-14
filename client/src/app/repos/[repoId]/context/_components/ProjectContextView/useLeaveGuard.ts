/* useLeaveGuard — while `active`, warns before the tab closes (beforeunload),
   intercepts in-app link clicks (handing the href to `onBlocked`), registers a
   nav guard for programmatic navigation (command palette, repo switcher,
   g-shortcuts) and intercepts Back/Forward. `onBlockedAction` receives a
   `proceed` callback to run if the user confirms. */
"use client";

import React from "react";
import { registerNavGuard } from "../../../../../../lib/nav-guard";

export function useLeaveGuard(
  active: boolean,
  onBlocked: (href: string) => void,
  onBlockedAction?: (proceed: () => void) => void,
) {
  const actionRef = React.useRef(onBlockedAction);
  actionRef.current = onBlockedAction;

  React.useEffect(() => {
    if (!active) return;
    const here = window.location.href;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/")) return;
      e.preventDefault();
      e.stopPropagation();
      onBlocked(href);
    };
    // Back/Forward has already moved the URL: remember where it went, put the
    // current page back on the stack and ask; confirming pushes the destination.
    const onPopState = (e: PopStateEvent) => {
      const dest = window.location.pathname + window.location.search + window.location.hash;
      e.stopImmediatePropagation();
      window.history.pushState(null, "", here);
      onBlocked(dest);
    };
    const unregister = registerNavGuard((proceed) => {
      if (!actionRef.current) return false;
      actionRef.current(proceed);
      return true;
    });
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [active, onBlocked]);
}
