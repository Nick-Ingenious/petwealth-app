import type { ListQuery } from "@petwealth/domain";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function toPage<T>(items: T[], total: number, q: Pick<ListQuery, "page" | "pageSize">): Page<T> {
  return { items, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export const offsetOf = (q: Pick<ListQuery, "page" | "pageSize">) => (q.page - 1) * q.pageSize;

/** Escape LIKE wildcards in user search input. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
