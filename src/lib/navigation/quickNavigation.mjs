/**
 * Orders the candidate destinations by visit frequency (and recency for ties).
 * A saved personal order takes precedence once the user has rearranged shortcuts.
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

export function applyQuickNavigationOrder(pages, savedOrder) {
  if (!Array.isArray(pages)) return [];
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return [...pages];

  const byHref = new Map(pages.map((page) => [page.href, page]));
  const seen = new Set();
  const ordered = [];
  savedOrder.forEach((href) => {
    const page = byHref.get(href);
    if (page && !seen.has(href)) {
      ordered.push(page);
      seen.add(href);
    }
  });
  pages.forEach((page) => {
    if (!seen.has(page.href)) ordered.push(page);
  });
  return ordered;
}

export function getQuickNavigationPages(pages, usage = {}, preference = null, limit = 4) {
  const ranked = rankQuickNavigationPages(pages, usage, Array.isArray(pages) ? pages.length : 0);
  const hasPersonalOrder = preference?.customized === true && Array.isArray(preference.order);
  const ordered = hasPersonalOrder
    ? applyQuickNavigationOrder(ranked, preference.order)
    : ranked;
  return ordered.slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
}

export function moveQuickNavigationPage(pages, fromHref, toHref) {
  if (!Array.isArray(pages) || fromHref === toHref) return Array.isArray(pages) ? [...pages] : [];
  const fromIndex = pages.findIndex((page) => page.href === fromHref);
  const toIndex = pages.findIndex((page) => page.href === toHref);
  if (fromIndex < 0 || toIndex < 0) return [...pages];
  const reordered = [...pages];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}
