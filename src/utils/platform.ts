/** macOS is the only platform with DTM's native Apple pasteboard and updater support. */
export const isMacOS =
  typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X/.test(navigator.userAgent);

/** The primary selection modifier follows the host desktop convention. */
export function hasPrimaryModifier(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
): boolean {
  return isMacOS ? event.metaKey : event.ctrlKey;
}
