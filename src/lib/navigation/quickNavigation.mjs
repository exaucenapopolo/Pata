/**
 * Returns the four most visited application destinations for the current user.
 * Visit count is the primary ranking signal; most recent visit breaks ties.
 * Entries with no history remain as useful defaults for new users.
 */
export function rankQuickNavigationPages(pages, usage = {}, limit = 4) {
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(0, Math.floor(Number(limit)))
    : 4;
  if (!Array.isArray(pages) || safeLimit === 0) return [];

  return pages
    .map((page, index) => {
      const record = usage && typeof usage === 'object' ? usage[page.href] : null;
      const rawCount = Number(record?.count);
      const rawLastVisited = Number(record?.lastVisitedAt);
      return {
        ...page,
        visitCount: Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0,
        lastVisitedAt: Number.isFinite(rawLastVisited) ? Math.max(0, rawLastVisited) : 0,
        _originalOrder: index,
      };
    })
    .sort((a, b) => (
      b.visitCount - a.visitCount
      || b.lastVisitedAt - a.lastVisitedAt
      || a._originalOrder - b._originalOrder
    ))
    .slice(0, safeLimit)
    .map(({ _originalOrder, ...page }) => page);
}
