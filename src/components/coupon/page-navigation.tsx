type PageNavigationProps = {
  page: number;
  totalPages: number;
  totalElements?: number | undefined;
  onChange: (page: number) => void;
};

export function PageNavigation({ page, totalPages, totalElements, onChange }: PageNavigationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="페이지 이동">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="rounded-[3px] border border-yh-rule px-3 py-2 text-sm font-semibold disabled:opacity-35"
      >
        이전
      </button>
      <span className="yh-num text-sm text-yh-ink-2">
        {page + 1} / {totalPages}
        {typeof totalElements === "number" && (
          <span className="ml-2 text-yh-ink-3">총 {totalElements.toLocaleString("ko-KR")}건</span>
        )}
      </span>
      <button
        type="button"
        disabled={page + 1 >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-[3px] border border-yh-rule px-3 py-2 text-sm font-semibold disabled:opacity-35"
      >
        다음
      </button>
    </nav>
  );
}
