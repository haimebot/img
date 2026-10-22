import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Star,
  Award,
  ArrowRight,
  Edit3,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Layers,
  Tag,
  Sparkles,
  Loader2,
  RotateCcw,
  Download,
  Cloud,
  Key,
  Play,
  Pause,
  Gauge,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { ImageItem } from '../types';
import {
  BROKEN_IMG_SVG,
  isRemoteImageUrl,
  cleanImageUrl,
  getImageCandidates,
  getAcceleratedImageUrl,
  preloadImage
} from '../utils/imageHelper';

interface ModalViewerProps {
  isOpen: boolean;
  item: ImageItem | null;
  productGroup: ImageItem[];
  currentIndexInGroup: number;
  totalImagesCount: number;
  markedDeleteCount: number;
  highlightedCount: number;
  isMarkedDelete: boolean;
  isHighlighted: boolean;
  isRemovingBg?: boolean;
  onClose: () => void;
  onNavigateGroup: (newPos: number) => void;
  onDeleteCurrent: () => void;
  onHighlightCurrent: () => void;
  onSetAsFirst: () => void;
  onKeepAndNextSKU: () => void;
  onOpenEditLink: (item: ImageItem) => void;
  onOpenEditMetadata: (item: ImageItem) => void;
  onRemoveBg?: (item: ImageItem, bgColor?: 'white' | 'transparent') => void;
  onRevertLink?: (item: ImageItem) => void;
  onOpenImgbbSettings?: () => void;
}

interface ModalSlideImageProps {
  item: ImageItem;
  isCurrent: boolean;
  onOpenEditLink: (item: ImageItem) => void;
}

const ModalSlideImage: React.FC<ModalSlideImageProps> = ({ item, isCurrent, onOpenEditLink }) => {
  const isRemote = isRemoteImageUrl(item.link);
  const candidates = useMemo(() => {
    if (!isRemote) return [BROKEN_IMG_SVG];
    return getImageCandidates(item.link, 1200);
  }, [item.link, isRemote]);

  const [candidateIdx, setCandidateIdx] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setCandidateIdx(0);
    setIsLoaded(false);
    setIsFailed(!isRemote);
  }, [item.link, isRemote]);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
      setIsFailed(false);
    }
  }, [candidateIdx, item.link]);

  const handleError = () => {
    if (candidateIdx + 1 < candidates.length) {
      setCandidateIdx(prev => prev + 1);
    } else {
      setIsFailed(true);
      setIsLoaded(true);
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFailed(false);
    setIsLoaded(false);
    setCandidateIdx(0);
  };

  const currentSrc = isFailed ? BROKEN_IMG_SVG : candidates[candidateIdx] || BROKEN_IMG_SVG;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Subtle skeleton while loading first time */}
      {!isLoaded && !isFailed && (
        <div className="absolute inset-0 bg-slate-100/50 dark:bg-slate-900/50 flex flex-col items-center justify-center animate-pulse z-10 rounded-xl">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-1.5" />
          <span className="text-[11px] font-mono text-slate-400">Loading...</span>
        </div>
      )}

      {/* Failed fallback with Quick Fix / Edit Link */}
      {isFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center z-20 bg-slate-100/90 dark:bg-slate-900/95 rounded-xl border border-rose-500/30">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-1" />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Image load failed</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[220px] truncate mt-0.5">{item.link}</p>
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              type="button"
              onClick={handleRetry}
              className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 text-[10px] font-bold rounded shadow-xs cursor-pointer flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditLink(item);
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold rounded shadow-xs cursor-pointer flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" />
              <span>Fix Link</span>
            </button>
          </div>
        </div>
      )}

      <img
        ref={imgRef}
        src={currentSrc}
        alt={`Amazon product ${item.sku} image ${item.imgNo}`}
        referrerPolicy="no-referrer"
        loading={isCurrent ? "eager" : "lazy"}
        decoding="async"
        className={`max-w-full max-h-full object-contain transition-opacity duration-150 ${
          isLoaded && !isFailed ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => {
          setIsLoaded(true);
          setIsFailed(false);
        }}
        onError={handleError}
      />
    </div>
  );
};

export const ModalViewer: React.FC<ModalViewerProps> = ({
  isOpen,
  item,
  productGroup,
  currentIndexInGroup,
  totalImagesCount,
  markedDeleteCount,
  highlightedCount,
  isMarkedDelete,
  isHighlighted,
  isRemovingBg = false,
  onClose,
  onNavigateGroup,
  onDeleteCurrent,
  onHighlightCurrent,
  onSetAsFirst,
  onKeepAndNextSKU,
  onOpenEditLink,
  onOpenEditMetadata,
  onRemoveBg,
  onRevertLink,
  onOpenImgbbSettings
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  // Slide Speed & Slideshow State
  const [isPlaying, setIsPlaying] = useState(false);
  const [slideSpeed, setSlideSpeed] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('amazon_gallery_slide_speed');
      return saved ? parseInt(saved, 10) : 1500;
    } catch {
      return 1500;
    }
  });
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | 'none'>('none');
  const [slideProgress, setSlideProgress] = useState(0);

  // Preload adjacent images in product group for instantaneous slide speed
  useEffect(() => {
    if (!productGroup || productGroup.length <= 1) return;

    // Next 2 slides & previous slide
    const next1 = productGroup[currentIndexInGroup + 1];
    const next2 = productGroup[currentIndexInGroup + 2];
    const prev1 = productGroup[currentIndexInGroup - 1];

    const toPreload: string[] = [];
    if (next1 && isRemoteImageUrl(next1.link)) {
      toPreload.push(...getImageCandidates(next1.link, 1200));
    }
    if (next2 && isRemoteImageUrl(next2.link)) {
      toPreload.push(...getImageCandidates(next2.link, 1200));
    }
    if (prev1 && isRemoteImageUrl(prev1.link)) {
      toPreload.push(...getImageCandidates(prev1.link, 1200));
    }

    toPreload.forEach(url => {
      preloadImage(url);
    });
  }, [productGroup, currentIndexInGroup]);

  const handlePrev = useCallback(() => {
    if (currentIndexInGroup > 0) {
      setSlideDirection('prev');
      onNavigateGroup(currentIndexInGroup - 1);
    }
  }, [currentIndexInGroup, onNavigateGroup]);

  const handleNext = useCallback(() => {
    if (currentIndexInGroup < productGroup.length - 1) {
      setSlideDirection('next');
      onNavigateGroup(currentIndexInGroup + 1);
    } else if (isPlaying) {
      // Loop to beginning in auto slideshow
      setSlideDirection('next');
      onNavigateGroup(0);
    }
  }, [currentIndexInGroup, productGroup.length, onNavigateGroup, isPlaying]);

  const handleSelectSlide = useCallback((pos: number) => {
    if (pos !== currentIndexInGroup) {
      setSlideDirection(pos > currentIndexInGroup ? 'next' : 'prev');
      onNavigateGroup(pos);
    }
  }, [currentIndexInGroup, onNavigateGroup]);

  // Auto-play slideshow timer
  useEffect(() => {
    if (!isPlaying || !isOpen) {
      setSlideProgress(0);
      return;
    }

    const intervalTime = 50; // update progress every 50ms for smooth bar
    const step = (intervalTime / slideSpeed) * 100;

    const timer = setInterval(() => {
      setSlideProgress(prev => {
        if (prev + step >= 100) {
          handleNext();
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, isOpen, slideSpeed, handleNext]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
    setSlideProgress(0);
  }, []);

  const handleChangeSpeed = useCallback((speedMs: number) => {
    setSlideSpeed(speedMs);
    try {
      localStorage.setItem('amazon_gallery_slide_speed', String(speedMs));
    } catch {}
    setSlideProgress(0);
  }, []);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is editing inside an input element
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      }
      if (e.key === '[') {
        const speeds = [500, 1000, 1500, 2500, 4000];
        const curIdx = speeds.indexOf(slideSpeed);
        if (curIdx > 0) handleChangeSpeed(speeds[curIdx - 1]);
      }
      if (e.key === ']') {
        const speeds = [500, 1000, 1500, 2500, 4000];
        const curIdx = speeds.indexOf(slideSpeed);
        if (curIdx < speeds.length - 1 && curIdx !== -1) handleChangeSpeed(speeds[curIdx + 1]);
      }
      if (e.key === 'Delete') onDeleteCurrent();
      if (e.key === 'h' || e.key === 'H') onHighlightCurrent();
      if (e.key === 'Enter') onKeepAndNextSKU();
      if ((e.key === 'e' || e.key === 'E') && item) onOpenEditLink(item);
      if ((e.key === 'm' || e.key === 'M') && item) onOpenEditMetadata(item);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, item, handlePrev, handleNext, handleTogglePlay, handleChangeSpeed, slideSpeed, onDeleteCurrent, onHighlightCurrent, onKeepAndNextSKU, onClose, onOpenEditLink, onOpenEditMetadata]);

  const handleCopyLink = () => {
    if (item?.link) {
      navigator.clipboard.writeText(item.link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (!isOpen || !item) return null;

  const isRemote = isRemoteImageUrl(item.link);
  const isFirstImage = item.imgNo === 1;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/90 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Top Floating Action Bar with High-Visibility Delete & Close */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-2">
        {/* High-Visibility Delete Button */}
        <button
          onClick={onDeleteCurrent}
          className={`px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-2xl border transition-all cursor-pointer ${
            isMarkedDelete
              ? 'bg-rose-600 text-white border-rose-500 ring-2 ring-rose-400/60 scale-105'
              : 'bg-slate-900/90 hover:bg-rose-600 text-rose-300 hover:text-white border-slate-700 hover:border-rose-500'
          }`}
          title="Mark for Delete (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isMarkedDelete ? 'Marked Delete' : 'Delete'}</span>
        </button>

        {/* Highlight Button */}
        <button
          onClick={onHighlightCurrent}
          className={`px-2.5 sm:px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 shadow-2xl border transition-all cursor-pointer ${
            isHighlighted
              ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50'
              : 'bg-slate-900/90 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border-slate-700 hover:border-amber-400'
          }`}
          title="Highlight Row (H)"
        >
          <Star className={`w-3.5 h-3.5 ${isHighlighted ? 'fill-slate-950' : ''}`} />
          <span className="hidden sm:inline">Highlight</span>
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white bg-slate-900/90 hover:bg-slate-800 rounded-full border border-slate-700 transition-all shadow-xl cursor-pointer"
          title="Close Modal (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-5xl h-[94vh] md:h-[88vh] max-h-[900px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-y-auto md:overflow-hidden flex flex-col md:flex-row text-slate-900 dark:text-slate-100 transition-colors">
        <h2 className="sr-only">Product Image Carousel and Inspector for SKU {item.sku}</h2>
        
        {/* LEFT PANEL: MAIN IMAGE DISPLAY & CAROUSEL */}
        <div className="w-full md:flex-1 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-between p-2.5 sm:p-4 relative min-h-0 h-full overflow-hidden transition-colors shrink-0 md:shrink">
          
          {/* Top Slide Speed & Auto-Slideshow Controller */}
          <div className="w-full flex items-center justify-between px-2 sm:px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs z-20 shrink-0 mb-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={handleTogglePlay}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                  isPlaying
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 scale-105'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-400 hover:text-slate-950'
                }`}
                title={isPlaying ? 'Pause Slideshow (Space)' : 'Start Auto-Slideshow (Space)'}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play Slide</span>
                  </>
                )}
              </button>

              {/* Live Progress Bar when playing */}
              {isPlaying && (
                <div className="flex items-center gap-1.5 pl-1">
                  <div className="w-14 sm:w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-75 ease-linear rounded-full"
                      style={{ width: `${slideProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Slide Speed Selector */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 mr-1 hidden sm:flex">
                <Gauge className="w-3 h-3 text-amber-500" />
                <span>Speed:</span>
              </div>
              {[
                { label: '0.5s', ms: 500, title: 'Turbo 0.5s' },
                { label: '1s', ms: 1000, title: 'Fast 1s' },
                { label: '1.5s', ms: 1500, title: 'Normal 1.5s' },
                { label: '2.5s', ms: 2500, title: 'Relaxed 2.5s' },
                { label: '4s', ms: 4000, title: 'Slow 4s' }
              ].map((preset) => (
                <button
                  key={preset.ms}
                  type="button"
                  onClick={() => handleChangeSpeed(preset.ms)}
                  title={`${preset.title} - Hotkeys [ and ]`}
                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    slideSpeed === preset.ms
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Stage Image */}
          <div className="relative w-full flex-1 flex items-center justify-center min-h-0 py-1 sm:py-2">
            
            {/* Prev Arrow */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndexInGroup === 0}
              className="absolute left-2 z-20 p-2 sm:p-2.5 bg-white/90 dark:bg-slate-900/80 hover:bg-amber-400 text-slate-800 dark:text-slate-200 hover:text-slate-950 disabled:opacity-20 disabled:hover:bg-white/90 dark:disabled:hover:bg-slate-900/80 disabled:hover:text-slate-200 rounded-full border border-slate-300 dark:border-slate-700 transition-all shadow-lg cursor-pointer"
              title="Previous Image (←)"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Image Frame */}
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="relative max-w-full max-h-full aspect-square bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center p-0 touch-pan-y"
            >
              {/* Removing BG processing overlay */}
              {isRemovingBg && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center z-30 gap-2 text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                  <span className="text-xs font-bold tracking-wider uppercase text-amber-300">Removing Background via Remove.bg...</span>
                </div>
              )}

              {/* 60FPS Hardware-Accelerated Sliding Track - Zero Lag, Pure 60fps Motion */}
              <div
                className="flex h-full w-full transition-transform duration-220 ease-out will-change-transform"
                style={{
                  transform: `translateX(-${currentIndexInGroup * 100}%)`,
                }}
              >
                {productGroup.map((grpItem, pos) => (
                  <div
                    key={grpItem.id}
                    className="w-full min-w-full h-full flex items-center justify-center p-2 shrink-0 relative"
                  >
                    <ModalSlideImage
                      item={grpItem}
                      isCurrent={pos === currentIndexInGroup}
                      onOpenEditLink={onOpenEditLink}
                    />
                  </div>
                ))}
              </div>

              {/* Counter & Status Overlay */}
              <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-1 rounded-full backdrop-blur-xs flex items-center gap-2 shadow-sm z-20 pointer-events-none">
                <span>{currentIndexInGroup + 1} / {productGroup.length}</span>
                {isPlaying && (
                  <span className="text-[10px] text-amber-500 font-mono animate-pulse">
                    PLAYING ({slideSpeed / 1000}s)
                  </span>
                )}
              </div>
            </div>

            {/* Next Arrow */}
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndexInGroup === productGroup.length - 1 && !isPlaying}
              className="absolute right-2 z-20 p-2 sm:p-2.5 bg-white/90 dark:bg-slate-900/80 hover:bg-amber-400 text-slate-800 dark:text-slate-200 hover:text-slate-950 disabled:opacity-20 disabled:hover:bg-white/90 dark:disabled:hover:bg-slate-900/80 disabled:hover:text-slate-200 rounded-full border border-slate-300 dark:border-slate-700 transition-all shadow-lg cursor-pointer"
              title="Next Image (→)"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Product Thumbnail Strip */}
          <div className="w-full flex items-center gap-2 overflow-x-auto py-2 px-1 max-w-full scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
            {productGroup.map((grpItem, pos) => {
              const isActive = pos === currentIndexInGroup;
              const isGrpRemote = isRemoteImageUrl(grpItem.link);
              const thumbCandidates = isGrpRemote ? getImageCandidates(grpItem.link, 120) : [BROKEN_IMG_SVG];
              const thumbSrc = thumbCandidates[0] || BROKEN_IMG_SVG;

              return (
                <button
                  key={grpItem.id}
                  onClick={() => handleSelectSlide(pos)}
                  className={`relative shrink-0 w-12 h-12 rounded-lg border-2 overflow-hidden bg-white dark:bg-slate-900 transition-all cursor-pointer ${
                    isActive
                      ? 'border-amber-400 ring-2 ring-amber-400/40 shadow-lg scale-105'
                      : grpItem.deleted
                      ? 'border-rose-600/60 opacity-40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <img
                    src={thumbSrc}
                    alt={`Amazon product ${grpItem.sku} thumbnail image ${grpItem.imgNo}`}
                    referrerPolicy="no-referrer"
                    loading="eager"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (thumbCandidates[1] && target.src !== thumbCandidates[1]) {
                        target.src = thumbCandidates[1];
                      } else if (thumbCandidates[2] && target.src !== thumbCandidates[2]) {
                        target.src = thumbCandidates[2];
                      } else {
                        target.onerror = null;
                        target.src = BROKEN_IMG_SVG;
                      }
                    }}
                  />
                  {grpItem.imgNo === 1 && (
                    <span className="absolute bottom-0 right-0 bg-amber-500 text-slate-950 text-[8px] font-black px-1 rounded-tl">
                      1st
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Bar inside Left Panel */}
          <div className="w-full shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2 pt-2 border-t border-slate-200 dark:border-slate-900 bg-slate-100 dark:bg-slate-950 z-10">
            
            {/* Delete button */}
            <button
              onClick={onDeleteCurrent}
              className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all shadow-md ${
                isMarkedDelete
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-rose-100 dark:bg-rose-950/40 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white border-rose-300 dark:border-rose-800/60'
              }`}
              title="Mark for Delete (Del)"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>

            {/* Highlight button */}
            <button
              onClick={onHighlightCurrent}
              className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all shadow-md ${
                isHighlighted
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-amber-100 dark:bg-amber-950/40 hover:bg-amber-400 text-amber-800 dark:text-amber-300 hover:text-slate-950 border-amber-300 dark:border-amber-800/60'
              }`}
              title="Highlight Row (H)"
            >
              <Star className="w-4 h-4" />
              Highlight
            </button>

            {/* 1-Click Remove BG Button */}
            {onRemoveBg && (
              <button
                onClick={() => onRemoveBg(item, 'white')}
                disabled={isRemovingBg}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-100 dark:bg-emerald-950/40 hover:bg-emerald-500 text-emerald-800 dark:text-emerald-300 hover:text-slate-950 disabled:opacity-40 border border-emerald-300 dark:border-emerald-800/60 flex items-center justify-center gap-1.5 transition-all shadow-md"
                title="1-Click Remove Background via Remove.bg API (Amazon Pure White)"
              >
                {isRemovingBg ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{isRemovingBg ? 'Working...' : 'Remove BG'}</span>
              </button>
            )}

            {/* Set as 1st Main Image button */}
            <button
              onClick={onSetAsFirst}
              disabled={isFirstImage}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-purple-100 dark:bg-purple-950/40 hover:bg-purple-600 text-purple-800 dark:text-purple-300 hover:text-white disabled:opacity-40 border border-purple-300 dark:border-purple-800/60 flex items-center justify-center gap-1.5 transition-all shadow-md"
              title="Reorder to #1 Position"
            >
              <Award className="w-4 h-4" />
              {isFirstImage ? 'Is 1st' : 'Set as 1st'}
            </button>

            {/* DIRECT EDIT LINK BUTTON */}
            <button
              onClick={() => onOpenEditLink(item)}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-cyan-100 dark:bg-cyan-950/40 hover:bg-cyan-500 text-cyan-800 dark:text-cyan-300 hover:text-slate-950 border border-cyan-300 dark:border-cyan-800/60 flex items-center justify-center gap-1.5 transition-all shadow-md"
              title="Change Image Link / URL (E)"
            >
              <Edit3 className="w-4 h-4" />
              Change Link
            </button>

            {/* Next SKU button */}
            <button
              onClick={onKeepAndNextSKU}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 col-span-2 sm:col-span-1 border border-amber-300 flex items-center justify-center gap-1.5 transition-all shadow-md font-black"
              title="Jump to Next SKU (Enter)"
            >
              Next SKU
              <ArrowRight className="w-4 h-4" />
            </button>

          </div>

        </div>

        {/* RIGHT PANEL: PRODUCT METADATA & SIDEBAR */}
        <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-900 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between overflow-y-auto space-y-4 transition-colors">
          
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Product Information
              </h3>
              <button
                onClick={() => onOpenEditMetadata(item)}
                className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20 font-semibold flex items-center gap-1 transition-colors"
                title="Edit Material, Category & Title"
              >
                <Edit2 className="w-3 h-3" /> Edit Info
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold">SKU Code</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm font-mono">{item.sku}</span>
              </div>

              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold">Row Number</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">Excel Row #{item.rowIdx}</span>
              </div>

              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold">Title</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{item.title || '—'}</span>
              </div>

              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold flex items-center gap-1">
                  <Tag className="w-3 h-3 text-amber-500 dark:text-amber-400" /> Category
                </span>
                <span className="font-medium text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-900/40 inline-block mt-0.5">
                  {item.category || 'Not specified'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold flex items-center gap-1">
                  <Layers className="w-3 h-3 text-amber-500 dark:text-amber-400" /> Material
                </span>
                <span className="font-medium text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-900/40 inline-block mt-0.5">
                  {item.material || 'Not specified'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold">Package Includes</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{item.includes || '—'}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 block text-[11px] uppercase font-semibold">Current Image Link</span>
                  {item.link.includes('ibb.co') && (
                    <span className="text-[10px] bg-blue-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Cloud className="w-2.5 h-2.5" /> ImgBB Hosted
                    </span>
                  )}
                </div>
                
                <div className="mt-1 bg-white dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="font-mono text-[11px] text-amber-700 dark:text-amber-300/90 break-all line-clamp-3">
                    {item.link}
                  </p>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                    <button
                      onClick={handleCopyLink}
                      className="text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:white flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                    >
                      {copiedLink ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedLink ? 'Copied' : 'Copy'}
                    </button>

                    {isRemote && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 ml-auto"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* 1-Click AI Background Removal Card */}
                {onRemoveBg && (
                  <div className="mt-3 p-3 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        Remove.bg + ImgBB Link Generator
                      </span>
                      <div className="flex items-center gap-1">
                        {onOpenImgbbSettings && (
                          <button
                            onClick={onOpenImgbbSettings}
                            className="text-[10px] text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 p-0.5 rounded transition-colors"
                            title="Configure ImgBB API Key"
                          >
                            <Key className="w-3 h-3" />
                          </button>
                        )}
                        {item.isEditedLink && (
                          <span className="text-[9px] bg-emerald-500 text-slate-950 font-bold px-1.5 py-0.5 rounded">
                            Processed
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        onClick={() => onRemoveBg(item, 'white')}
                        disabled={isRemovingBg}
                        className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm disabled:opacity-40"
                        title="Amazon Standard Pure White (#FFFFFF)"
                      >
                        {isRemovingBg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Pure White
                      </button>

                      <button
                        onClick={() => onRemoveBg(item, 'transparent')}
                        disabled={isRemovingBg}
                        className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm disabled:opacity-40 border border-slate-700"
                        title="Transparent Cutout (PNG)"
                      >
                        {isRemovingBg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Transparent
                      </button>
                    </div>

                    {/* Revert link button if edited */}
                    {item.isEditedLink && onRevertLink && (
                      <button
                        onClick={() => onRevertLink(item)}
                        className="w-full py-1 text-[10px] text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center justify-center gap-1 font-semibold transition-colors mt-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Revert to Original Link
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <button
                    onClick={() => onOpenEditLink(item)}
                    className="py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 border border-slate-300 dark:border-slate-700 shadow-md"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Edit Link
                  </button>

                  <button
                    onClick={() => onOpenEditMetadata(item)}
                    className="py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit Details
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats & Shortcuts Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
              <div>Total: <span className="font-bold text-slate-900 dark:text-slate-100">{totalImagesCount}</span></div>
              <div>Marked: <span className="font-bold text-rose-600 dark:text-rose-400">{markedDeleteCount}</span></div>
              <div>Highlights: <span className="font-bold text-amber-600 dark:text-amber-400">{highlightedCount}</span></div>
              <div>In Product: <span className="font-bold text-emerald-600 dark:text-emerald-400">{productGroup.length}</span></div>
            </div>

            <div className="text-[10px] text-slate-500 pt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span><kbd className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-slate-700 dark:text-slate-300">←/→</kbd> Nav</span>
              <span><kbd className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-slate-700 dark:text-slate-300">Del</kbd> Delete</span>
              <span><kbd className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-slate-700 dark:text-slate-300">H</kbd> Highlight</span>
              <span><kbd className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-slate-700 dark:text-slate-300">E</kbd> Edit Link</span>
              <span><kbd className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-slate-700 dark:text-slate-300">M</kbd> Edit Meta</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

