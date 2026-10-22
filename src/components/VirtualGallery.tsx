import React, { useRef, useState, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { ArrowUp, ImageOff, Check, Trash2, Star, Minus } from 'lucide-react';
import { ImageItem } from '../types';
import { ImageCard } from './ImageCard';
import { isRemoteImageUrl, getImageCandidates, preloadImage } from '../utils/imageHelper';

export interface VirtualGalleryRef {
  scrollToItemId: (itemId: number) => void;
  scrollToRow: (rowIndex: number) => void;
  scrollToTop: () => void;
}

interface VirtualGalleryProps {
  items: ImageItem[];
  allImageItems: ImageItem[]; // Complete dataset to calculate extra counts
  highlightedRows: Set<number>;
  markedForDelete: Set<number>;
  lastCheckedItemId?: number | null;
  rowHandlePosition?: 'left' | 'right';
  removingBgItemId?: number | null;
  onOpenModal: (itemId: number) => void;
  onToggleHighlight: (rowIdx: number, e: React.MouseEvent) => void;
  onToggleDelete: (itemId: number, e: React.MouseEvent) => void;
  onOpenEditLink: (item: ImageItem, e: React.MouseEvent) => void;
  onRemoveBg?: (item: ImageItem, e: React.MouseEvent) => void;
  onScrollPosChange?: (visibleIndex: number, total: number) => void;
  onScrollDirectionChange?: (direction: 'up' | 'down') => void;
  // Whole row single-click actions
  onToggleRowDelete?: (itemIds: number[], e?: React.MouseEvent) => void;
  onDeleteRowDirect?: (itemIds: number[]) => void;
  onToggleRowHighlight?: (rowIndices: number[]) => void;
  onClearLastChecked?: () => void;
}

export const VirtualGallery = forwardRef<VirtualGalleryRef, VirtualGalleryProps>(({
  items,
  allImageItems,
  highlightedRows,
  markedForDelete,
  lastCheckedItemId,
  rowHandlePosition = 'right',
  removingBgItemId = null,
  onOpenModal,
  onToggleHighlight,
  onToggleDelete,
  onOpenEditLink,
  onRemoveBg,
  onScrollPosChange,
  onScrollDirectionChange,
  onToggleRowDelete,
  onDeleteRowDirect,
  onToggleRowHighlight,
  onClearLastChecked
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [pendingScrollItemId, setPendingScrollItemId] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return Math.max(320, window.innerWidth - 32);
    }
    return 1200;
  });
  const [containerHeight, setContainerHeight] = useState(800);

  // Compute last checked rowIdx to highlight all images belonging to the same SKU container
  const lastCheckedRowIdx = useMemo(() => {
    if (!lastCheckedItemId) return null;
    const match = allImageItems.find(it => it.id === lastCheckedItemId);
    return match ? match.rowIdx : null;
  }, [lastCheckedItemId, allImageItems]);

  // Calculate extra backend image count per row
  const backendCountByRow = useMemo(() => {
    const map: Record<number, number> = {};
    for (let i = 0; i < allImageItems.length; i++) {
      const it = allImageItems[i];
      if (!it.isFrontend && !it.deleted) {
        map[it.rowIdx] = (map[it.rowIdx] || 0) + 1;
      }
    }
    return map;
  }, [allImageItems]);

  // Handle ResizeObserver & Window Resize to track exact display dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rectWidth = containerRef.current.getBoundingClientRect().width;
        const clientW = containerRef.current.clientWidth;
        const parentW = containerRef.current.parentElement?.clientWidth || 0;
        const windowW = typeof window !== 'undefined' ? window.innerWidth - 32 : 0;

        const measured = rectWidth || clientW || parentW || windowW;
        if (measured > 100) {
          setContainerWidth(measured);
        }

        const measuredHeight =
          containerRef.current.clientHeight ||
          containerRef.current.getBoundingClientRect().height ||
          800;
        setContainerHeight(measuredHeight);
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateDimensions);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      if (containerRef.current.parentElement) {
        resizeObserver.observe(containerRef.current.parentElement);
      }
    }

    window.addEventListener('resize', updateDimensions);
    const timer = setTimeout(updateDimensions, 100);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
      clearTimeout(timer);
    };
  }, []);

  // Compute dynamic column count, row gutter width, and exact card width
  const rowGutterWidth = containerWidth < 450 ? 30 : containerWidth < 600 ? 36 : 46;
  const { columns, gap } = useMemo(() => {
    const g = containerWidth < 450 ? 6 : containerWidth < 600 ? 8 : containerWidth < 1200 ? 10 : 12;
    const availableCardWidth = Math.max(100, containerWidth - rowGutterWidth - g * 2);
    const targetCardWidth = containerWidth < 380 ? 120 : containerWidth < 500 ? 135 : containerWidth < 900 ? 160 : 180;

    const calculatedCols = Math.max(1, Math.floor((availableCardWidth - g) / (targetCardWidth + g)));
    return { columns: calculatedCols, gap: g };
  }, [containerWidth, rowGutterWidth]);

  const availableCardWidth = Math.max(100, containerWidth - rowGutterWidth - gap * 2);
  const itemWidth = Math.max(80, (availableCardWidth - gap * (columns - 1)) / columns);
  const itemHeight = itemWidth + 40; // Aspect square image + info label

  const totalItems = items.length;
  const totalRowsCount = Math.ceil(totalItems / columns);
  const totalHeight = totalRowsCount * (itemHeight + gap) + gap;

  // Handle scroll event
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    setScrollTop(st);

    // Scroll direction detector for Auto-Hide
    if (onScrollDirectionChange && Math.abs(st - lastScrollTopRef.current) > 15) {
      if (st > lastScrollTopRef.current && st > 60) {
        onScrollDirectionChange('down');
      } else if (st < lastScrollTopRef.current) {
        onScrollDirectionChange('up');
      }
      lastScrollTopRef.current = st;
    }

    if (onScrollPosChange && totalItems > 0) {
      const currentVisibleRow = Math.floor(st / (itemHeight + gap));
      const firstVisibleIndex = Math.min(currentVisibleRow * columns, totalItems - 1);
      onScrollPosChange(firstVisibleIndex + 1, totalItems);
    }
  }, [itemHeight, gap, columns, totalItems, onScrollPosChange, onScrollDirectionChange]);

  // Calculate visible row slice based on dynamic containerHeight
  const { visibleStartRow, visibleEndRow } = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - 2);
    const endRow = Math.min(
      totalRowsCount,
      Math.ceil((scrollTop + containerHeight) / (itemHeight + gap)) + 3
    );
    return { visibleStartRow: startRow, visibleEndRow: endRow };
  }, [scrollTop, containerHeight, itemHeight, gap, totalRowsCount]);

  // Group visible items by row for efficient rendering & row controls
  const visibleRowGroups = useMemo(() => {
    const groups: {
      rowIndex: number;
      items: { item: ImageItem; index: number; col: number }[];
      itemIds: number[];
      rowIndices: number[];
      isAllMarked: boolean;
      isSomeMarked: boolean;
      isAllHighlighted: boolean;
    }[] = [];

    for (let r = visibleStartRow; r < visibleEndRow; r++) {
      const startIdx = r * columns;
      const endIdx = Math.min(totalItems, (r + 1) * columns);
      if (startIdx >= totalItems) break;

      const rowItems: { item: ImageItem; index: number; col: number }[] = [];
      const itemIds: number[] = [];
      const rowIdxSet = new Set<number>();

      for (let i = startIdx; i < endIdx; i++) {
        const item = items[i];
        rowItems.push({ item, index: i, col: i - startIdx });
        itemIds.push(item.id);
        rowIdxSet.add(item.rowIdx);
      }

      const rowIndices = Array.from(rowIdxSet);
      const isAllMarked = itemIds.length > 0 && itemIds.every(id => markedForDelete.has(id));
      const isSomeMarked = !isAllMarked && itemIds.some(id => markedForDelete.has(id));
      const isAllHighlighted = rowIndices.length > 0 && rowIndices.every(rIdx => highlightedRows.has(rIdx));

      groups.push({
        rowIndex: r,
        items: rowItems,
        itemIds,
        rowIndices,
        isAllMarked,
        isSomeMarked,
        isAllHighlighted
      });
    }

    return groups;
  }, [visibleStartRow, visibleEndRow, columns, totalItems, items, markedForDelete, highlightedRows]);

  // Preload upcoming row images in background for instantaneous container scrolling
  useEffect(() => {
    if (!items.length) return;
    const upcomingStart = visibleEndRow * columns;
    const upcomingEnd = Math.min(items.length, (visibleEndRow + 2) * columns);
    for (let i = upcomingStart; i < upcomingEnd; i++) {
      const it = items[i];
      if (it && isRemoteImageUrl(it.link)) {
        const candidates = getImageCandidates(it.link, 380);
        if (candidates[0]) preloadImage(candidates[0]);
      }
    }
  }, [visibleEndRow, columns, items]);

  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const scrollToRow = useCallback((rowIndex: number) => {
    if (containerRef.current) {
      const targetTop = Math.max(0, rowIndex * (itemHeight + gap));
      containerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
      setScrollTop(targetTop);
    }
  }, [itemHeight, gap]);

  // Reactive scroll effect: trigger smooth scroll as soon as pendingScrollItemId is found in items
  useEffect(() => {
    if (pendingScrollItemId === null) return;

    // Find the target item in allImageItems
    const targetItem = allImageItems.find(it => it.id === pendingScrollItemId);
    const targetRowIdx = targetItem ? targetItem.rowIdx : null;

    // Look for matching item in currently rendered gallery items (by ID or by rowIdx)
    let idx = items.findIndex(it => it.id === pendingScrollItemId);
    if (idx === -1 && targetRowIdx !== null) {
      idx = items.findIndex(it => it.rowIdx === targetRowIdx);
    }

    if (idx !== -1 && containerRef.current) {
      const row = Math.floor(idx / columns);
      // Position the item's row centered in the container viewport
      const rowTop = row * (itemHeight + gap) + gap;
      const targetTop = Math.max(0, rowTop - containerHeight / 2 + itemHeight / 2);

      // Perform smooth scroll to exact position
      containerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });

      // Update local scrollTop so virtual window updates immediately
      setScrollTop(targetTop);
      setPendingScrollItemId(null);
    }
  }, [pendingScrollItemId, items, columns, itemHeight, gap, containerHeight, allImageItems]);

  useImperativeHandle(ref, () => ({
    scrollToItemId: (itemId: number) => {
      setPendingScrollItemId(itemId);
    },
    scrollToRow,
    scrollToTop
  }), [scrollToRow, scrollToTop]);

  if (totalItems === 0) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center p-8 bg-white/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
        <div className="p-4 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 mb-4 shadow-md">
          <ImageOff className="w-10 h-10 text-amber-500 dark:text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Images Found</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
          Open an Excel file or load a sample dataset to view product images in the ultra-fast virtual gallery.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Amazon Product Gallery Grid" className="relative w-full flex-1 flex flex-col min-h-0">
      <h2 className="sr-only">Product Image Gallery Grid</h2>
      {/* Scrollable Virtual Canvas Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full flex-1 h-full min-h-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-inner relative scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 transition-colors p-0"
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
          {visibleRowGroups.map((group) => {
            const rowTop = gap + group.rowIndex * (itemHeight + gap);

            const isHandleRight = rowHandlePosition === 'right';
            const handleLeft = isHandleRight
              ? containerWidth - gap - rowGutterWidth
              : gap;

            return (
              <React.Fragment key={`row-group-${group.rowIndex}`}>
                {/* Row Background Highlight Strip */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${rowTop - 4}px`,
                    left: `${gap}px`,
                    width: `${containerWidth - gap * 2}px`,
                    height: `${itemHeight + 8}px`
                  }}
                  className={`rounded-2xl pointer-events-none transition-all duration-150 ${
                    group.isAllMarked
                      ? 'bg-rose-500/10 border-2 border-rose-500/50 shadow-sm shadow-rose-500/10'
                      : group.isSomeMarked
                      ? 'bg-rose-500/[0.04] border border-dashed border-rose-500/40'
                      : group.isAllHighlighted
                      ? 'bg-amber-400/5 border border-amber-400/40'
                      : 'border border-transparent'
                  }`}
                />

                {/* Row Control Handle (Select Whole Row in 1 Click - moved into right) */}
                <div
                  style={{
                    position: 'absolute',
                    top: `${rowTop}px`,
                    left: `${handleLeft}px`,
                    width: `${rowGutterWidth}px`,
                    height: `${itemHeight}px`
                  }}
                  className={`group/handle flex flex-col items-center justify-between py-2 rounded-xl border transition-all z-10 ${
                    group.isAllMarked
                      ? 'bg-rose-100/90 dark:bg-rose-950/70 border-rose-400 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-md'
                      : group.isSomeMarked
                      ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900/60 text-rose-600'
                      : 'bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800/80 hover:border-amber-400/80 text-slate-400 hover:shadow-md'
                  }`}
                >
                  {/* Row Number Badge */}
                  <span
                    className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400"
                    title={`Row #${group.rowIndex + 1} (${group.itemIds.length} items)`}
                  >
                    R{group.rowIndex + 1}
                  </span>

                  {/* Circular Row Select Button (Matching user circle annotation) */}
                  <button
                    type="button"
                    title={
                      group.isAllMarked
                        ? `Row #${group.rowIndex + 1}: Click to unselect all ${group.itemIds.length} items`
                        : `Row #${group.rowIndex + 1}: Select entire row to mark all ${group.itemIds.length} items for delete in single click`
                    }
                    onClick={(e) => {
                      if (onToggleRowDelete) {
                        onToggleRowDelete(group.itemIds, e);
                      }
                    }}
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md shrink-0 ${
                      group.isAllMarked
                        ? 'bg-rose-600 border-2 border-rose-500 text-white ring-2 ring-rose-400/50 scale-105'
                        : group.isSomeMarked
                        ? 'bg-rose-100 dark:bg-rose-950 border-2 border-rose-500 text-rose-600 ring-1 ring-rose-400'
                        : 'border-2 border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:scale-110 text-transparent hover:text-rose-500'
                    }`}
                  >
                    {group.isAllMarked ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : group.isSomeMarked ? (
                      <Minus className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 opacity-0 group-hover/handle:opacity-100 transition-opacity" />
                    )}
                  </button>

                  {/* Quick Action Icons on the Row Handle */}
                  <div className="flex flex-col gap-1 items-center">
                    {onDeleteRowDirect && (
                      <button
                        type="button"
                        title={`Delete all ${group.itemIds.length} items in row #${group.rowIndex + 1} immediately`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRowDirect(group.itemIds);
                        }}
                        className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 transition-all cursor-pointer opacity-70 hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}

                    {onToggleRowHighlight && (
                      <button
                        type="button"
                        title={
                          group.isAllHighlighted
                            ? `Unhighlight row #${group.rowIndex + 1}`
                            : `Highlight row #${group.rowIndex + 1} in Excel`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleRowHighlight(group.rowIndices);
                        }}
                        className={`p-1 rounded-md border transition-all cursor-pointer opacity-70 hover:opacity-100 ${
                          group.isAllHighlighted
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-white/80 dark:bg-slate-900/80 hover:bg-amber-400/20 text-amber-600 dark:text-amber-400 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <Star className={`w-3 h-3 ${group.isAllHighlighted ? 'fill-slate-950' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Cards in this visual row */}
                {group.items.map(({ item, index, col }) => {
                  const cardLeft = isHandleRight
                    ? gap + col * (itemWidth + gap)
                    : gap + rowGutterWidth + gap + col * (itemWidth + gap);
                  const extraCount = backendCountByRow[item.rowIdx] || 0;
                  const isHighlighted = highlightedRows.has(item.rowIdx);
                  const isMarkedDelete = markedForDelete.has(item.id);
                  const isLastChecked =
                    item.id === lastCheckedItemId ||
                    (lastCheckedRowIdx !== null && item.rowIdx === lastCheckedRowIdx);

                  return (
                    <div
                      key={item.id || index}
                      style={{
                        position: 'absolute',
                        top: `${rowTop}px`,
                        left: `${cardLeft}px`,
                        width: `${itemWidth}px`,
                        height: `${itemHeight}px`
                      }}
                    >
                      <ImageCard
                        item={item}
                        extraCount={extraCount}
                        isHighlighted={isHighlighted}
                        isMarkedDelete={isMarkedDelete}
                        isLastChecked={isLastChecked}
                        isRemovingBg={removingBgItemId === item.id}
                        onOpenModal={onOpenModal}
                        onToggleHighlight={onToggleHighlight}
                        onToggleDelete={onToggleDelete}
                        onOpenEditLink={onOpenEditLink}
                        onRemoveBg={onRemoveBg}
                        onClearLastChecked={onClearLastChecked}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Floating Back to Top Button */}
      {scrollTop > 400 && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-4 right-4 z-20 p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-2xl transition-all hover:scale-110 border border-purple-400 font-bold cursor-pointer"
          title="Scroll to Top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </section>
  );
});
VirtualGallery.displayName = 'VirtualGallery';
