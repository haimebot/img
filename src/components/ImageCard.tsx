import React, { memo, useState, useEffect, useMemo } from 'react';
import { Star, Trash2, Edit3, AlertTriangle, Layers, LocateFixed, Zap, Sparkles, Loader2, X } from 'lucide-react';
import { ImageItem } from '../types';
import {
  BROKEN_IMG_SVG,
  isRemoteImageUrl,
  getImageCandidates
} from '../utils/imageHelper';

interface ImageCardProps {
  item: ImageItem;
  extraCount: number;
  isHighlighted: boolean;
  isMarkedDelete: boolean;
  isLastChecked?: boolean;
  isRemovingBg?: boolean;
  onOpenModal: (itemId: number) => void;
  onToggleHighlight: (rowIdx: number, e: React.MouseEvent) => void;
  onToggleDelete: (itemId: number, e: React.MouseEvent) => void;
  onOpenEditLink: (item: ImageItem, e: React.MouseEvent) => void;
  onRemoveBg?: (item: ImageItem, e: React.MouseEvent) => void;
  onClearLastChecked?: () => void;
}

export const ImageCard: React.FC<ImageCardProps> = memo(({
  item,
  extraCount,
  isHighlighted,
  isMarkedDelete,
  isLastChecked = false,
  isRemovingBg = false,
  onOpenModal,
  onToggleHighlight,
  onToggleDelete,
  onOpenEditLink,
  onRemoveBg,
  onClearLastChecked,
}) => {
  const isRemote = isRemoteImageUrl(item.link);

  // Compute prioritized multi-source loading candidates (Accelerated CDN -> Server Proxy -> Direct)
  const candidates = useMemo(() => {
    return isRemote ? getImageCandidates(item.link, 380) : [BROKEN_IMG_SVG];
  }, [item.link, isRemote]);

  const [candidateIdx, setCandidateIdx] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Reset state when link changes
  useEffect(() => {
    setCandidateIdx(0);
    setIsLoaded(false);
    setIsFailed(!isRemote);
  }, [item.link, isRemote]);

  const currentSrc = isFailed
    ? BROKEN_IMG_SVG
    : candidates[candidateIdx] || BROKEN_IMG_SVG;

  // Immediate detection if already cached by browser
  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
        setIsFailed(false);
      }
    }
  }, [currentSrc]);

  const handleImageError = () => {
    if (candidateIdx + 1 < candidates.length) {
      // Try next resilient fallback in the cascade
      setCandidateIdx(prev => prev + 1);
      setIsLoaded(false);
    } else {
      // All fallback candidates exhausted
      setIsFailed(true);
      setIsLoaded(true);
    }
  };

  const handleImageLoad = () => {
    setIsLoaded(true);
    setIsFailed(false);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFailed(false);
    setIsLoaded(false);
    setCandidateIdx(0);
  };

  return (
    <div
      onClick={() => onOpenModal(item.id)}
      className={`group relative flex flex-col bg-white dark:bg-slate-900 border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl ${
        isMarkedDelete
          ? 'border-2 border-rose-600 bg-rose-50/80 dark:bg-rose-950/40 ring-1 ring-rose-500/50'
          : isHighlighted
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 shadow-amber-500/10'
          : isLastChecked
          ? 'border-amber-400/60 dark:border-amber-400/40 shadow-xs'
          : 'border-slate-200 dark:border-slate-800 hover:border-amber-500/80 shadow-xs dark:shadow-slate-950/50'
      }`}
    >
      {/* Image Container */}
      <div className="relative w-full aspect-square bg-slate-50 dark:bg-slate-950 overflow-hidden flex items-center justify-center transition-colors">
        {/* Subtle shimmer skeleton until image is fully loaded */}
        {!isLoaded && !isFailed && !isRemovingBg && (
          <div className="absolute inset-0 bg-slate-200/50 dark:bg-slate-800/50 animate-pulse flex items-center justify-center">
            <span className="text-[10px] text-slate-400 font-mono">Loading...</span>
          </div>
        )}

        {/* Failed image fallback with quick retry */}
        {isFailed && !isRemovingBg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-slate-100 dark:bg-slate-900/90 z-10">
            <AlertTriangle className="w-6 h-6 text-amber-500 mb-1" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-full px-1">Load Failed</span>
            <div className="flex items-center gap-1 mt-1.5">
              <button
                type="button"
                onClick={handleRetry}
                className="px-2 py-0.5 bg-amber-400 hover:bg-amber-500 text-slate-950 text-[9px] font-bold rounded shadow-xs cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={(e) => onOpenEditLink(item, e)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-bold rounded shadow-xs cursor-pointer"
              >
                Fix Link
              </button>
            </div>
          </div>
        )}

        {/* Removing BG processing overlay */}
        {isRemovingBg && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center z-20 gap-1.5 text-white">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-[9px] font-bold tracking-wider uppercase text-amber-300">Remove.bg...</span>
          </div>
        )}

        <img
          ref={imgRef}
          src={currentSrc}
          alt={`Amazon product ${item.sku} image ${item.imgNo}`}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`w-full h-full object-contain p-1 transition-opacity duration-150 group-hover:scale-105 ${
            isLoaded && !isFailed ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />

        {/* Action overlay / top bar */}
        <div className="absolute top-1 left-1 right-1 sm:top-1.5 sm:left-1.5 sm:right-1.5 flex items-center justify-between pointer-events-none gap-1 z-20">
          {/* Status Indicators: Highlight (Star) & Last Checked */}
          <div className="flex items-center gap-1 pointer-events-auto min-w-0">
            {isHighlighted && (
              <span className="bg-amber-500 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md flex items-center gap-0.5 shrink-0" title="Highlighted in Excel">
                <Star className="w-2.5 h-2.5 fill-slate-950" />
              </span>
            )}
            {isLastChecked && (
              <span
                className="bg-slate-900/90 dark:bg-slate-800/95 text-slate-200 text-[8px] sm:text-[9px] font-medium px-1 sm:px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5 border border-slate-700/80 shrink-0"
                title={`Last Checked: Row #${item.rowIdx}`}
              >
                <LocateFixed className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span className="font-mono">#{item.rowIdx}</span>
                {onClearLastChecked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearLastChecked();
                    }}
                    className="ml-0.5 text-slate-400 hover:text-rose-400 cursor-pointer p-0.5 rounded"
                    title="Dismiss Last Checked indicator"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            )}
            {isMarkedDelete && (
              <span className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-md uppercase tracking-wider shrink-0">
                DELETE
              </span>
            )}
          </div>

          {/* Action Buttons: Delete is prioritized on far right and ALWAYS visible */}
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1 pointer-events-auto shrink-0">
            {/* 1-Click Remove Background Button */}
            {onRemoveBg && (
              <button
                type="button"
                title="Single-Click AI Remove Background (Amazon Pure White)"
                disabled={isRemovingBg}
                onClick={(e) => onRemoveBg(item, e)}
                className={`p-1 sm:p-1.5 rounded-md border transition-all shadow-md touch-manipulation cursor-pointer ${
                  isRemovingBg
                    ? 'bg-amber-400 text-slate-950 animate-pulse'
                    : 'bg-white/90 dark:bg-slate-900/90 hover:bg-emerald-500 text-emerald-600 dark:text-emerald-400 hover:text-white border-slate-300 dark:border-slate-700/80'
                }`}
              >
                {isRemovingBg ? (
                  <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                )}
              </button>
            )}

            {/* Quick Link Edit Button */}
            <button
              type="button"
              title="Change Image Link / URL"
              onClick={(e) => onOpenEditLink(item, e)}
              className="p-1 sm:p-1.5 bg-white/90 dark:bg-slate-900/90 hover:bg-amber-400 text-slate-700 dark:text-slate-300 hover:text-slate-950 rounded-md border border-slate-300 dark:border-slate-700/80 transition-all shadow-md touch-manipulation cursor-pointer"
            >
              <Edit3 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>

            {/* Toggle Highlight Button */}
            <button
              type="button"
              title="Highlight Row in Excel"
              onClick={(e) => onToggleHighlight(item.rowIdx, e)}
              className={`p-1 sm:p-1.5 rounded-md border transition-all shadow-md touch-manipulation cursor-pointer ${
                isHighlighted
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-white/90 dark:bg-slate-900/90 hover:bg-amber-400/30 text-amber-600 dark:text-amber-400 border-slate-300 dark:border-slate-700/80'
              }`}
            >
              <Star className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isHighlighted ? 'fill-slate-950' : ''}`} />
            </button>

            {/* Toggle Delete Button - ALWAYS VISIBLE WITH HIGH-CONTRAST */}
            <button
              type="button"
              title={isMarkedDelete ? "Unmark Delete" : "Mark for Delete (Del)"}
              onClick={(e) => onToggleDelete(item.id, e)}
              className={`p-1 sm:p-1.5 rounded-md border transition-all shadow-md touch-manipulation cursor-pointer shrink-0 ${
                isMarkedDelete
                  ? 'bg-rose-600 text-white border-rose-500 font-bold ring-2 ring-rose-400/50'
                  : 'bg-white/90 dark:bg-slate-900/90 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white border-slate-300 dark:border-slate-700/80'
              }`}
            >
              <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
          </div>
        </div>

        {/* Bottom Badges */}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-semibold pointer-events-none">
          {/* Edited Link Badge */}
          {item.isEditedLink && (
            <span className="bg-cyan-500/90 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-1">
              ✏️ Edited
            </span>
          )}

          {/* Broken Link Badge */}
          {!isRemote && (
            <span className="bg-amber-500/90 text-slate-950 text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> Local Path
            </span>
          )}

          {/* Extra Images Badge */}
          {extraCount > 0 && (
            <span className="ml-auto bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
              <Layers className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" /> +{extraCount}
            </span>
          )}
        </div>
      </div>

      {/* Info footer */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs transition-colors">
        <span className="font-bold text-slate-800 dark:text-slate-200 truncate pr-1" title={item.sku}>
          {item.sku}
        </span>
        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700/50 shrink-0 font-mono">
          #{item.imgNo}
        </span>
      </div>
    </div>
  );
});

ImageCard.displayName = 'ImageCard';
