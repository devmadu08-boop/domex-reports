export const DELIVERED_ROWS_PER_PAGE = 20;
export function paginateDeliveredEntries(entries) {
  const count = Math.max(1, Math.ceil(entries.length / DELIVERED_ROWS_PER_PAGE));
  return Array.from({ length: count }, (_, pageIndex) => ({
    entries: entries.slice(pageIndex * DELIVERED_ROWS_PER_PAGE, (pageIndex + 1) * DELIVERED_ROWS_PER_PAGE),
    startIndex: pageIndex * DELIVERED_ROWS_PER_PAGE,
    isFinalPage: pageIndex === count - 1,
  }));
}
