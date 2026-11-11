import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X } from "lucide-react";
import { isTableNumber } from "@/lib/table-data";
import { t } from "@/lib/i18n";

export interface TableCell { text: string; content?: ReactNode; align?: TableAlign; vAlign?: "top" | "middle" | "bottom" }
export type TableAlign = "left" | "center" | "right" | "start" | "end";
export interface TableColumn extends TableCell { width?: number }
export interface RichTableProps {
  columns: TableColumn[];
  rows: TableCell[][];
  name?: string;
  expanded?: boolean;
  direction?: "rtl" | "ltr";
  headless?: boolean;
}

/** The native modal supplies focus containment, Escape, an inert background and focus restoration. */
export function TableDialog({ title, onClose, children, returnFocus }: { title: string; onClose: () => void; children: ReactNode; returnFocus: HTMLElement | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, [returnFocus]);
  return createPortal(
    <dialog ref={ref} aria-labelledby={id} onCancel={onClose} onClose={onClose}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
      className="m-auto flex max-h-[94dvh] w-[min(96vw,1400px)] max-w-none flex-col overflow-hidden rounded-2xl border border-hairline bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/55">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline/40 px-4 py-3">
        <h2 id={id} className="min-w-0 truncate text-sm font-medium">{title}</h2>
        <button type="button" autoFocus onClick={onClose} className="table-action" aria-label={t("table.close")}><X size={16} /></button>
      </header>
      <div className="min-h-0 overflow-auto p-3 sm:p-5">{children}</div>
    </dialog>, document.body,
  );
}

/** Read-only content: preserve the author's row order and keep controls out of messages. */
export function RichTable({ columns, rows, name = t("table.title"), expanded = false, direction = "ltr", headless = false }: RichTableProps) {
  return <div className="rich-table min-w-0 max-w-full text-ink">
    <TableViewport columns={columns} rows={rows} name={name} expanded={expanded} direction={direction} headless={headless} />
  </div>;
}

function TableViewport({ columns, rows, name, expanded, direction, headless = false }: RichTableProps) {
  const order = useMemo(() => rows.map((_, index) => index), [rows]);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLTableSectionElement>(null);
  const [headingHeight, setHeadingHeight] = useState(40);
  useEffect(() => {
    if (!heading.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setHeadingHeight(entry.target.getBoundingClientRect().height); });
    observer.observe(heading.current);
    return () => observer.disconnect();
  }, []);
  const virtual = order.length > 80;
  const widths = useMemo(() => columns.map((column, index) => column.width ?? Math.min(280, Math.max(96,
    Math.max(column.text.length, ...rows.slice(0, 100).map((row) => Math.min(40, row[index]?.text.length ?? 0))) * 7 + 28,
  ))), [columns, rows]);
  const numeric = useMemo(() => columns.map((_, index) => {
    const nonempty = rows.slice(0, 200).map((row) => row[index]?.text.trim() ?? "").filter(Boolean);
    return nonempty.length > 0 && nonempty.every(isTableNumber);
  }), [columns, rows]);
  const virtualizer = useVirtualizer({ count: order.length, getScrollElement: () => scroll.current, estimateSize: () => 42,
    getItemKey: (index) => order[index]!, overscan: 6, enabled: virtual, initialRect: { width: 800, height: 400 }, scrollMargin: headingHeight });
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [order]);
  useEffect(() => { virtualizer.measure(); }, [widths, virtualizer]);
  const items = virtual ? virtualizer.getVirtualItems() : order.map((id, index) => ({ key: id, index, start: 0, end: 0 }));
  const before = virtual && items.length ? Math.max(0, items[0]!.start - headingHeight) : 0;
  const after = virtual && items.length ? Math.max(0, virtualizer.getTotalSize() - items.at(-1)!.end + headingHeight) : 0;
  const alignment = (column: TableColumn, index: number) => column.align ?? (numeric[index] || direction === "rtl" ? "right" : "left");
  return <div ref={scroll} tabIndex={0} role="region" aria-label={name} className="overflow-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
    style={{ maxHeight: expanded ? "65dvh" : virtual ? 440 : undefined }}>
    <table dir={direction} aria-label={name} aria-rowcount={order.length + (headless ? 0 : 1)} className="w-full table-fixed border-separate border-spacing-0 text-[14px]" style={{ minWidth: widths.reduce((a, b) => a + b, 0) }}>
      <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead ref={heading} hidden={headless} className="sticky top-0 z-10 bg-panel"><tr aria-rowindex={1}>
        {columns.map((column, index) => <th key={index} scope="col"
          className="h-10 border-b border-hairline/60 px-3 py-2 font-medium" style={{ textAlign: alignment(column, index) }}>
          <div className="flex items-center gap-1">
            <span dir="auto" className="min-w-0 flex-1 break-words">{column.content ?? (column.text || t("table.column", { number: index + 1 }))}</span>
          </div>
        </th>)}
      </tr></thead>
      <tbody>
        {before > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: before, padding: 0 }} /></tr>}
        {items.map((item) => <tr key={item.key} data-index={item.index} ref={virtual ? virtualizer.measureElement : undefined} aria-rowindex={item.index + (headless ? 1 : 2)}
          className="">
          {columns.map((column, index) => {
            const cell = rows[order[item.index]!]![index];
            return <td key={index} className="border-b border-hairline/20 px-3 py-2.5 align-top tabular-nums" style={{ textAlign: cell?.align ?? alignment(column, index), verticalAlign: cell?.vAlign }}>
              <div dir="auto" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{cell?.content ?? cell?.text}</div>
            </td>;
          })}
        </tr>)}
        {after > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: after, padding: 0 }} /></tr>}
      </tbody>
    </table>
    {order.length === 0 && <p className="p-8 text-center text-sm text-ink-secondary">{t("table.empty")}</p>}
  </div>;
}
