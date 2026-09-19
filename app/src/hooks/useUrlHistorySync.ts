import { useEffect, useRef, useState } from "react";
import type { SavedState } from "../lib/storage";
import { encodeStateToURL, decodeStateFromURL } from "../lib/storage";

/**
 * Mirrors `state` into the URL hash and restores it on Back/Forward.
 *
 * History strategy:
 *  - On first change after a quiet period, pushState(previous hash) to create a
 *    Back target, then replaceState(current) for every subsequent change.
 *  - After 400ms of inactivity the current hash becomes the new "committed" hash.
 *  - Initial load and popstate only replace, never push.
 *
 * Returns the current URL length (for the share-size indicator).
 */
export function useUrlHistorySync(state: SavedState, onRestore: (data: SavedState) => void): number {
  const [urlLength, setUrlLength] = useState(0);
  const committedHashRef = useRef<string>(window.location.hash.slice(1));
  const dirtyRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipPushRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Initial load from hash (once)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    skipPushRef.current = true;
    decodeStateFromURL(hash).then(data => { if (data) onRestoreRef.current(data); });
  }, []);

  // Write state → hash
  useEffect(() => {
    const shouldPush = !skipPushRef.current;
    skipPushRef.current = false;
    encodeStateToURL(state).then(hash => {
      if (!shouldPush) {
        window.history.replaceState(null, "", `#${hash}`);
        setUrlLength(window.location.href.length);
        committedHashRef.current = hash;
        dirtyRef.current = false;
        return;
      }
      if (hash === committedHashRef.current) return;
      if (!dirtyRef.current) {
        window.history.pushState(null, "", `#${committedHashRef.current}`);
        dirtyRef.current = true;
      }
      window.history.replaceState(null, "", `#${hash}`);
      setUrlLength(window.location.href.length);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        committedHashRef.current = hash;
        dirtyRef.current = false;
      }, 400);
    });
  }, [state]);

  // Back/Forward → restore
  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      skipPushRef.current = true;
      committedHashRef.current = hash;
      decodeStateFromURL(hash).then(data => { if (data) onRestoreRef.current(data); });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return urlLength;
}
