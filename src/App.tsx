import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  LocateFixed,
  Trash2,
  LayoutGrid,
  FileSpreadsheet,
  Download,
  Layers,
  Star,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check
} from 'lucide-react';
import {
  ImageItem,
  AppStats,
  FilterStatus
} from './types';
import {
  buildImageListFromExcelData,
  generateDemoDataset,
  downloadExcelWithHighlights,
  applyChangesToExcelData
} from './utils/excelHelper';
import {
  isRemoteImageUrl,
  requestRemoveBg,
  getStoredImgbbKey,
  getStoredRemoveBgKey
} from './utils/imageHelper';
import { saveSessionToDB, loadSessionFromDB } from './utils/idbHelper';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { VirtualGallery, VirtualGalleryRef } from './components/VirtualGallery';
import { ModalViewer } from './components/ModalViewer';
import { EditLinkModal } from './components/EditLinkModal';
import { EditProductMetadataModal } from './components/EditProductMetadataModal';
import { ImgbbKeyModal } from './components/ImgbbKeyModal';

export default function App() {
  // Ref for Virtual Gallery imperative scroll
  const galleryRef = useRef<VirtualGalleryRef>(null);

  // Application Data State
  const [excelData, setExcelData] = useState<(string | number)[][]>([]);
  const [imageDataList, setImageDataList] = useState<ImageItem[]>([]);
  const [markedForDelete, setMarkedForDelete] = useState<Set<number>>(new Set());
  const [highlightedRows, setHighlightedRows] = useState<Set<number>>(new Set());

  // Last Checked Listing State (persisted in localStorage)
  const [lastCheckedItemId, setLastCheckedItemId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('amazon_gallery_last_checked_id');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  const updateLastCheckedItem = useCallback((id: number) => {
    setLastCheckedItemId(id);
    try {
      localStorage.setItem('amazon_gallery_last_checked_id', String(id));
    } catch {
      // Ignore quota error if any
    }
  }, []);

  const handleClearLastChecked = useCallback(() => {
    setLastCheckedItemId(null);
    try {
      localStorage.removeItem('amazon_gallery_last_checked_id');
    } catch {
      // Ignore
    }
    setSaveMessage('Cleared last checked checkpoint');
    setTimeout(() => setSaveMessage(''), 2500);
  }, []);

  const lastCheckedItem = useMemo(() => {
    if (lastCheckedItemId === null) return null;
    return imageDataList.find(it => it.id === lastCheckedItemId && !it.deleted) || null;
  }, [lastCheckedItemId, imageDataList]);
  
  // UI, Filter & Layout Visibility States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('frontend');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [sessionSavedTime, setSessionSavedTime] = useState<string>('');
  const [scrollInfo, setScrollInfo] = useState({ visibleIndex: 0, total: 0 });

  // Layout Visibility Controls (Auto & Manual Hide) & Theme State
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isAutoHide, setIsAutoHide] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Row Handle Position State (defaults to 'right' as requested)
  const [rowHandlePosition, setRowHandlePosition] = useState<'right' | 'left'>(() => {
    try {
      return (localStorage.getItem('amazon_gallery_row_handle_pos') as 'right' | 'left') || 'right';
    } catch {
      return 'right';
    }
  });

  // ImgBB Integration State (api.imgbb.com/1/upload)
  const [isImgbbModalOpen, setIsImgbbModalOpen] = useState(false);
  const [hasImgbbKey, setHasImgbbKey] = useState<boolean>(() => Boolean(getStoredImgbbKey()));

  const handleToggleRowHandlePosition = useCallback(() => {
    setRowHandlePosition(prev => {
      const next = prev === 'right' ? 'left' : 'right';
      try {
        localStorage.setItem('amazon_gallery_row_handle_pos', next);
      } catch {}
      setSaveMessage(`Row controls moved to ${next.toUpperCase()}`);
      setTimeout(() => setSaveMessage(''), 2500);
      return next;
    });
  }, []);

  // Synchronize document dark class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleToggleTheme = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  // Toggle handlers for Layout options
  const handleToggleHeader = useCallback(() => {
    setIsHeaderVisible(prev => !prev);
  }, []);

  const handleToggleNavbar = useCallback(() => {
    setIsNavbarVisible(prev => !prev);
  }, []);

  const handleToggleAutoHide = useCallback(() => {
    setIsAutoHide(prev => !prev);
  }, []);

  const handleToggleCompact = useCallback(() => {
    setIsCompact(prev => !prev);
  }, []);

  const handleToggleFullFocus = useCallback(() => {
    setIsHeaderVisible(prev => {
      if (prev || isNavbarVisible) {
        setIsNavbarVisible(false);
        return false;
      } else {
        setIsNavbarVisible(true);
        return true;
      }
    });
  }, [isNavbarVisible]);

  // Handle auto-hide on scroll direction
  const handleScrollDirectionChange = useCallback((dir: 'up' | 'down') => {
    if (isAutoHide) {
      if (dir === 'down') {
        setIsHeaderVisible(false);
        setIsNavbarVisible(false);
      } else if (dir === 'up') {
        setIsHeaderVisible(true);
        setIsNavbarVisible(true);
      }
    }
  }, [isAutoHide]);

  // Modal & Link/Metadata Editing States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  
  const [isEditLinkModalOpen, setIsEditLinkModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ImageItem | null>(null);

  const [isEditMetaModalOpen, setIsEditMetaModalOpen] = useState(false);
  const [editingMetaItem, setEditingMetaItem] = useState<ImageItem | null>(null);

  // Auto-persist session helper
  const persistSession = useCallback(async (
    data: (string | number)[][],
    highlights: Set<number>,
    deletes: Set<number>
  ) => {
    if (data.length === 0) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const success = await saveSessionToDB({
      excelData: data,
      highlightedRows: Array.from(highlights),
      markedForDelete: Array.from(deletes),
      timestamp
    });
    if (success) {
      setSessionSavedTime(timestamp);
    }
  }, []);

  // Initialize and restore full session from IndexedDB
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadingMessage('Restoring saved session from IndexedDB database...');

    async function init() {
      try {
        const savedSession = await loadSessionFromDB();
        if (savedSession && savedSession.excelData && savedSession.excelData.length > 0 && isMounted) {
          const result = buildImageListFromExcelData(savedSession.excelData);
          setExcelData(result.excelData);
          setImageDataList(result.imageDataList);
          setHighlightedRows(new Set(savedSession.highlightedRows || []));
          setMarkedForDelete(new Set(savedSession.markedForDelete || []));
          setSessionSavedTime(savedSession.timestamp || 'Restored');
          setSaveMessage('📂 Restored previous active session with full dataset and edits!');
          setTimeout(() => setSaveMessage(''), 4000);
          return;
        }
      } catch (err) {
        console.warn('IndexedDB restore failed:', err);
      }

      // Default demo initialization if no saved session
      if (isMounted) {
        try {
          const demoResult = generateDemoDataset(2000);
          setExcelData(demoResult.excelData);
          setImageDataList(demoResult.imageDataList);
          await persistSession(demoResult.excelData, new Set(), new Set());
        } catch (err) {
          console.error('Initialization error:', err);
        }
      }
    }

    init().finally(() => {
      if (isMounted) {
        setIsLoading(false);
        setLoadingMessage('');
      }
    });

    return () => { isMounted = false; };
  }, [persistSession]);

  // Auto-save to IndexedDB whenever excelData, highlights, or deletions change (debounced to eliminate UI lag)
  useEffect(() => {
    if (excelData.length === 0) return;
    const timer = setTimeout(() => {
      persistSession(excelData, highlightedRows, markedForDelete);
    }, 1000);
    return () => clearTimeout(timer);
  }, [excelData, highlightedRows, markedForDelete, persistSession]);

  // Compute App Stats
  const stats: AppStats = useMemo(() => {
    const frontendItems = imageDataList.filter(it => it.isFrontend && !it.deleted);
    const totalImages = imageDataList.filter(it => !it.deleted).length;
    const editedLinksCount = imageDataList.filter(it => it.isEditedLink || it.isEditedMeta || it.isBgRemoved).length;

    return {
      totalRows: Math.max(0, excelData.length - 1),
      frontendCount: frontendItems.length,
      totalImages,
      markedDeleteCount: markedForDelete.size,
      highlightedRowsCount: highlightedRows.size,
      editedLinksCount
    };
  }, [imageDataList, markedForDelete, highlightedRows, excelData.length]);

  // Filter Gallery Items Display according to selected filter status button
  const filteredGalleryItems = useMemo(() => {
    let list: ImageItem[] = [];

    if (filterStatus === 'frontend') {
      list = imageDataList.filter(it => it.isFrontend && !it.deleted);
    } else if (filterStatus === 'highlighted') {
      // Highlighted as frontend link only
      list = imageDataList.filter(it => it.isFrontend && !it.deleted && highlightedRows.has(it.rowIdx));
    } else if (filterStatus === 'deleted') {
      // Show all marked for delete items and SKUs
      list = imageDataList.filter(it => markedForDelete.has(it.id) || it.deleted);
    } else if (filterStatus === 'edited') {
      list = imageDataList.filter(it => !it.deleted && (it.isEditedLink || it.isEditedMeta));
    } else if (filterStatus === 'broken') {
      list = imageDataList.filter(it => !it.deleted && !isRemoteImageUrl(it.link));
    } else {
      // Default fallback: show frontend images
      list = imageDataList.filter(it => it.isFrontend && !it.deleted);
    }

    // Apply Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        it =>
          it.sku.toLowerCase().includes(q) ||
          (it.title && it.title.toLowerCase().includes(q)) ||
          (it.category && it.category.toLowerCase().includes(q)) ||
          (it.material && it.material.toLowerCase().includes(q)) ||
          it.link.toLowerCase().includes(q)
      );
    }

    return list;
  }, [imageDataList, filterStatus, searchQuery, highlightedRows, markedForDelete]);

  // Load Excel File
  const handleFileUpload = useCallback((file: File) => {
    setIsLoading(true);
    setLoadingMessage(`Reading ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (e) => {
      setTimeout(() => {
        try {
          const buffer = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(buffer, { type: 'array', dense: true, cellStyles: false, cellDates: false });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const parsedData: (string | number)[][] = XLSX.utils.sheet_to_json(firstSheet, {
            header: 1,
            raw: true,
            defval: ''
          });

          setLoadingMessage('Processing product rows & classifying image columns...');
          const result = buildImageListFromExcelData(parsedData);

          setExcelData(result.excelData);
          setImageDataList(result.imageDataList);
          setMarkedForDelete(new Set());
          setHighlightedRows(new Set());

          persistSession(result.excelData, new Set(), new Set());

          setSaveMessage(`Loaded ${parsedData.length - 1} products with ${result.imageDataList.length} images!`);
          setTimeout(() => setSaveMessage(''), 4000);
        } catch (err) {
          console.error('File parsing error:', err);
          alert('Error loading Excel file. Make sure it is a valid .xlsx or .xls spreadsheet.');
        } finally {
          setIsLoading(false);
          setLoadingMessage('');
        }
      }, 20);
    };

    reader.readAsArrayBuffer(file);
  }, [persistSession]);

  // Load Demo Dataset
  const handleLoadDemo = useCallback((rowCount: number) => {
    setIsLoading(true);
    setLoadingMessage(`Generating ${rowCount.toLocaleString()} sample Amazon products...`);

    setTimeout(() => {
      try {
        const demoResult = generateDemoDataset(rowCount);
        setExcelData(demoResult.excelData);
        setImageDataList(demoResult.imageDataList);
        setMarkedForDelete(new Set());
        setHighlightedRows(new Set());

        persistSession(demoResult.excelData, new Set(), new Set());

        setSaveMessage(`Loaded ${rowCount.toLocaleString()} demo products!`);
        setTimeout(() => setSaveMessage(''), 4000);
      } catch (err) {
        console.error('Demo generation error:', err);
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    }, 30);
  }, [persistSession]);

  // Manual Session Save Trigger
  const handleManualSaveSession = useCallback(async () => {
    if (excelData.length === 0) return;
    setIsLoading(true);
    setLoadingMessage('Saving complete session dataset to browser storage...');
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const success = await saveSessionToDB({
      excelData,
      highlightedRows: Array.from(highlightedRows),
      markedForDelete: Array.from(markedForDelete),
      timestamp: nowStr
    });
    setIsLoading(false);
    setLoadingMessage('');
    if (success) {
      setSessionSavedTime(nowStr);
      setSaveMessage('💾 Session & all custom edits saved permanently to IndexedDB!');
      setTimeout(() => setSaveMessage(''), 4000);
    }
  }, [excelData, highlightedRows, markedForDelete]);

  // Toggle Delete Mark
  const handleToggleDelete = useCallback((itemId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMarkedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  // Toggle Highlight Row
  const handleToggleHighlight = useCallback((rowIdx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHighlightedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIdx)) {
        next.delete(rowIdx);
      } else {
        next.add(rowIdx);
      }
      return next;
    });
  }, []);

  // Clear Delete Marks
  const handleClearMarks = useCallback(() => {
    if (markedForDelete.size === 0) return;
    if (confirm(`Clear ${markedForDelete.size} delete marks?`)) {
      setMarkedForDelete(new Set());
    }
  }, [markedForDelete.size]);

  // Clear Highlights
  const handleClearHighlights = useCallback(() => {
    if (highlightedRows.size === 0) return;
    if (confirm(`Clear ${highlightedRows.size} highlighted rows?`)) {
      setHighlightedRows(new Set());
    }
  }, [highlightedRows.size]);

  // Whole Row Selection: Mark all items in row for deletion in 1 click
  const handleToggleRowDelete = useCallback((itemIds: number[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (itemIds.length === 0) return;
    setMarkedForDelete(prev => {
      const next = new Set(prev);
      const allMarked = itemIds.every(id => next.has(id));
      if (allMarked) {
        itemIds.forEach(id => next.delete(id));
      } else {
        itemIds.forEach(id => next.add(id));
      }
      return next;
    });
    setSaveMessage(`Toggled selection for entire row (${itemIds.length} items)`);
    setTimeout(() => setSaveMessage(''), 2500);
  }, []);

  // Direct Row Deletion: Permanently remove all items in row in 1 click
  const handleDeleteRowDirect = useCallback((itemIds: number[]) => {
    if (itemIds.length === 0) return;
    const toDelete = new Set(itemIds);
    // Apply changes to excelData and imageDataList
    const updatedData = applyChangesToExcelData(excelData, imageDataList, toDelete);
    setExcelData(updatedData);
    setImageDataList(prev => prev.map(it => toDelete.has(it.id) ? { ...it, deleted: true } : it));
    setMarkedForDelete(prev => {
      const next = new Set(prev);
      itemIds.forEach(id => next.delete(id));
      return next;
    });
    setSaveMessage(`🗑️ Deleted all ${itemIds.length} items in row from Excel dataset!`);
    setTimeout(() => setSaveMessage(''), 3500);
  }, [excelData, imageDataList]);

  // Toggle Highlight for all items in row in 1 click
  const handleToggleRowHighlight = useCallback((rowIndices: number[]) => {
    if (rowIndices.length === 0) return;
    setHighlightedRows(prev => {
      const next = new Set(prev);
      const allHighlighted = rowIndices.every(r => next.has(r));
      if (allHighlighted) {
        rowIndices.forEach(r => next.delete(r));
      } else {
        rowIndices.forEach(r => next.add(r));
      }
      return next;
    });
  }, []);

  // Bulk Highlight All Filtered Rows
  const handleBulkHighlightFiltered = useCallback(() => {
    if (filteredGalleryItems.length === 0) return;
    const rowIndices = Array.from(new Set(filteredGalleryItems.map(it => it.rowIdx)));

    setHighlightedRows(prev => {
      const next = new Set(prev);
      const allHighlighted = rowIndices.every(r => next.has(r));
      if (allHighlighted) {
        rowIndices.forEach(r => next.delete(r));
        setSaveMessage(`⭐ Unhighlighted ${rowIndices.length} filtered rows`);
      } else {
        rowIndices.forEach(r => next.add(r));
        setSaveMessage(`⭐ Highlighted ${rowIndices.length} filtered rows in yellow`);
      }
      return next;
    });
    setTimeout(() => setSaveMessage(''), 3000);
  }, [filteredGalleryItems]);

  // Bulk Mark All Filtered Items for Deletion
  const handleBulkDeleteFiltered = useCallback(() => {
    if (filteredGalleryItems.length === 0) return;
    const itemIds = filteredGalleryItems.map(it => it.id);

    setMarkedForDelete(prev => {
      const next = new Set(prev);
      const allMarked = itemIds.every(id => next.has(id));
      if (allMarked) {
        itemIds.forEach(id => next.delete(id));
        setSaveMessage(`Cleared delete marks for ${itemIds.length} items`);
      } else {
        itemIds.forEach(id => next.add(id));
        setSaveMessage(`🗑️ Marked ${itemIds.length} filtered items for deletion`);
      }
      return next;
    });
    setTimeout(() => setSaveMessage(''), 3000);
  }, [filteredGalleryItems]);

  // CHANGE IMAGE LINK
  const handleSaveLink = useCallback((itemId: number, newLink: string) => {
    setImageDataList(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            link: newLink,
            isEditedLink: true
          };
        }
        return item;
      })
    );

    const targetItem = imageDataList.find(it => it.id === itemId);
    if (targetItem) {
      setExcelData(prevData => {
        const newData = [...prevData];
        if (newData[targetItem.rowIdx]) {
          const newRow = [...newData[targetItem.rowIdx]];
          newRow[targetItem.colIdx] = newLink;
          newData[targetItem.rowIdx] = newRow;
        }
        return newData;
      });
    }

    setSaveMessage('✅ Link updated successfully in gallery and Excel cell!');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [imageDataList]);

  // SINGLE-CLICK REMOVE BACKGROUND VIA REMOVE.BG API + IMGBB LINK GENERATION
  const [removingBgItemId, setRemovingBgItemId] = useState<number | null>(null);

  const handleRemoveBg = useCallback(async (
    item: ImageItem,
    bgColor: 'white' | 'transparent' = 'white',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    if (removingBgItemId !== null) return;

    setRemovingBgItemId(item.id);
    const storedImgbbKey = getStoredImgbbKey();
    const storedRemoveBgKey = getStoredRemoveBgKey();
    setSaveMessage(
      storedImgbbKey
        ? `🪄 Removing background for SKU ${item.sku} & uploading to ImgBB...`
        : `🪄 Removing background for SKU ${item.sku} via Remove.bg...`
    );

    try {
      const res = await requestRemoveBg(item.link, {
        bgColor,
        size: 'auto',
        name: `${item.sku || 'sku'}_nobg`,
        imgbbKey: storedImgbbKey || undefined,
        removeBgKey: storedRemoveBgKey || undefined
      });

      if (res.success) {
        // Prioritize generated ImgBB URL (https://i.ibb.co/...) as requested,
        // fallback to server hosted link, or dataUri
        const finalUrl = res.imgbbUrl || res.link || res.localHostedUrl || res.dataUri;
        if (finalUrl) {
          handleSaveLink(item.id, finalUrl);
        }

        if (res.imgbbUrl) {
          setSaveMessage(
            res.creditExhausted
              ? `✨ Studio background cleaned & uploaded to ImgBB for SKU ${item.sku}! (${res.imgbbUrl})`
              : `✨ Background removed & uploaded to ImgBB for SKU ${item.sku}! (${res.imgbbUrl})`
          );
        } else if (res.creditExhausted) {
          setSaveMessage(`✨ Studio background cleaned for SKU ${item.sku}! (In-browser studio engine active)`);
        } else if (storedImgbbKey && res.imgbbError) {
          setSaveMessage(`✨ Background removed! (ImgBB note: ${res.imgbbError} - used server link)`);
        } else {
          setSaveMessage(`✨ Background removed for SKU ${item.sku}! (Tip: Set ImgBB key in Header for permanent i.ibb.co links)`);
        }
      } else {
        throw new Error(res.message || 'Background removal returned no image');
      }
    } catch (err: any) {
      console.warn('Remove background notice:', err);
      if (err.message?.includes('quota') || err.message?.includes('credit')) {
        setSaveMessage(`ℹ️ Remove.bg credit quota reached. Set your API key in Settings (Cloud icon) for unlimited neural cutouts.`);
      } else {
        setSaveMessage(`❌ Remove.bg notice: ${err.message || 'Processing failed'}`);
      }
    } finally {
      setRemovingBgItemId(null);
      setTimeout(() => setSaveMessage(''), 4500);
    }
  }, [removingBgItemId, handleSaveLink]);

  const handleRevertLink = useCallback((item: ImageItem) => {
    if (!item.originalLink) return;
    handleSaveLink(item.id, item.originalLink);
    setImageDataList(prev =>
      prev.map(it => it.id === item.id ? { ...it, isEditedLink: false } : it)
    );
    setSaveMessage(`↩️ Reverted image to original link for SKU ${item.sku}`);
    setTimeout(() => setSaveMessage(''), 3000);
  }, [handleSaveLink]);

  // EDIT PRODUCT METADATA (Material, Category, Title, Includes)
  const handleSaveProductMetadata = useCallback((rowIdx: number, newMeta: {
    sku?: string;
    title?: string;
    category?: string;
    material?: string;
    includes?: string;
  }) => {
    // 1. Update imageDataList for all images on this row
    setImageDataList(prev =>
      prev.map(item => {
        if (item.rowIdx === rowIdx) {
          return {
            ...item,
            title: newMeta.title !== undefined ? newMeta.title : item.title,
            category: newMeta.category !== undefined ? newMeta.category : item.category,
            material: newMeta.material !== undefined ? newMeta.material : item.material,
            includes: newMeta.includes !== undefined ? newMeta.includes : item.includes,
            isEditedMeta: true
          };
        }
        return item;
      })
    );

    // 2. Update cell values in excelData
    setExcelData(prevData => {
      if (!prevData || prevData.length <= rowIdx) return prevData;
      const newData = [...prevData];
      const headers = (newData[0] || []).map(h => String(h).toLowerCase().trim());
      const row = [...(newData[rowIdx] || [])];

      // Detect header columns or append new headers
      let titleCol = headers.findIndex(h => h.includes('title') || h.includes('name'));
      let catCol = headers.findIndex(h => h.includes('category') || h.includes('type'));
      let matCol = headers.findIndex(h => h.includes('material') || h.includes('fabric'));
      let incCol = headers.findIndex(h => h.includes('include') || h.includes('package'));

      if (titleCol === -1) { titleCol = newData[0].length; newData[0].push('Title'); }
      if (catCol === -1) { catCol = newData[0].length; newData[0].push('Category'); }
      if (matCol === -1) { matCol = newData[0].length; newData[0].push('Material'); }
      if (incCol === -1) { incCol = newData[0].length; newData[0].push('Includes'); }

      if (newMeta.title !== undefined) row[titleCol] = newMeta.title;
      if (newMeta.category !== undefined) row[catCol] = newMeta.category;
      if (newMeta.material !== undefined) row[matCol] = newMeta.material;
      if (newMeta.includes !== undefined) row[incCol] = newMeta.includes;

      newData[rowIdx] = row;
      return newData;
    });

    setSaveMessage(`✅ Material & Category updated in Excel for Row #${rowIdx}!`);
    setTimeout(() => setSaveMessage(''), 3500);
  }, []);

  // Open Edit Link Modal
  const handleOpenEditLink = useCallback((item: ImageItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setIsEditLinkModalOpen(true);
  }, []);

  // Open Edit Metadata Modal
  const handleOpenEditMetadata = useCallback((item: ImageItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingMetaItem(item);
    setIsEditMetaModalOpen(true);
  }, []);

  // Open Main Viewer Modal
  const handleOpenModal = useCallback((itemId: number) => {
    setSelectedItemId(itemId);
    setIsModalOpen(true);
    updateLastCheckedItem(itemId);
  }, [updateLastCheckedItem]);

  // Go to Last Checked Listing (Scrolls directly to item row in gallery without opening modal)
  const handleGoToLastChecked = useCallback(() => {
    if (!lastCheckedItem) {
      setSaveMessage('⚠️ No last checked listing yet. Open any item to set a checkpoint!');
      setTimeout(() => setSaveMessage(''), 3500);
      return;
    }

    // Determine target filter tab if item is deleted or marked
    let targetFilter: FilterStatus = 'frontend';
    if (markedForDelete.has(lastCheckedItem.id) || lastCheckedItem.deleted) {
      targetFilter = 'deleted';
    } else if (lastCheckedItem.isEditedLink || lastCheckedItem.isEditedMeta) {
      targetFilter = filterStatus === 'edited' ? 'edited' : 'frontend';
    }

    // Ensure item is visible by resetting search query and switching filter tab if needed
    const isVisibleInCurrent = filteredGalleryItems.some(
      it => it.id === lastCheckedItem.id || it.rowIdx === lastCheckedItem.rowIdx
    );
    if (!isVisibleInCurrent || searchQuery.trim() !== '') {
      setSearchQuery('');
      setFilterStatus(targetFilter);
    }

    // Trigger imperative scroll on gallery ref
    if (galleryRef.current) {
      galleryRef.current.scrollToItemId(lastCheckedItem.id);
    }

    setSaveMessage(`🎯 Scrolled to last checked listing: SKU ${lastCheckedItem.sku} (Row #${lastCheckedItem.rowIdx})`);
    setTimeout(() => setSaveMessage(''), 3500);
  }, [lastCheckedItem, filteredGalleryItems, searchQuery, filterStatus, markedForDelete]);

  // Keyboard shortcut: Press 'L' to go to last checked listing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
      if (e.key === 'l' || e.key === 'L') {
        if (!isModalOpen && lastCheckedItem) {
          e.preventDefault();
          handleGoToLastChecked();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, lastCheckedItem, handleGoToLastChecked]);

  // Save changes (apply marked deletes and link/metadata edits to excelData)
  const handleSaveChanges = useCallback(() => {
    if (excelData.length === 0) return;

    setIsLoading(true);
    setLoadingMessage(`Saving all changes to Excel dataset...`);

    setTimeout(() => {
      const deletedIds = new Set(markedForDelete);

      // 1. Update excelData with all edits and deletions
      const updatedData = applyChangesToExcelData(excelData, imageDataList, markedForDelete);
      setExcelData(updatedData);

      // 2. Update imageDataList deleted flags
      if (deletedIds.size > 0) {
        setImageDataList(prevList =>
          prevList.map(item =>
            deletedIds.has(item.id) ? { ...item, deleted: true } : item
          )
        );
        setMarkedForDelete(new Set());
      }

      setIsLoading(false);
      setLoadingMessage('');

      const msg = deletedIds.size > 0
        ? `✅ Saved! Applied changes and removed ${deletedIds.size} deleted items.`
        : `✅ Saved! All edits and changes updated in Excel data.`;
      setSaveMessage(msg);
      setTimeout(() => setSaveMessage(''), 3500);
    }, 40);
  }, [excelData, markedForDelete, imageDataList]);

  // Download Updated Excel Sheet
  const handleDownloadExcel = useCallback(async () => {
    if (excelData.length === 0) return;

    setIsLoading(true);
    setLoadingMessage('Building updated Excel workbook with all edits and highlighted rows...');

    try {
      // Synchronize all pending edits & deletions into the Excel data matrix before export
      const finalExcelData = applyChangesToExcelData(excelData, imageDataList, markedForDelete);

      await downloadExcelWithHighlights(
        finalExcelData,
        highlightedRows,
        `amazon_images_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      setSaveMessage(`✅ Downloaded! Excel file exported with all changes & ${highlightedRows.size} highlighted rows.`);
      setTimeout(() => setSaveMessage(''), 3500);
    } catch (err) {
      console.error('Download error:', err);
      alert('Error exporting Excel file. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [excelData, imageDataList, markedForDelete, highlightedRows]);

  // Product Group Modal Logic
  const selectedItem = useMemo(() => {
    if (selectedItemId === null) return null;
    return imageDataList.find(it => it.id === selectedItemId) || null;
  }, [selectedItemId, imageDataList]);

  const productGroup = useMemo(() => {
    if (!selectedItem) return [];
    return imageDataList
      .filter(it => it.rowIdx === selectedItem.rowIdx && !it.deleted)
      .sort((a, b) => a.imgNo - b.imgNo);
  }, [selectedItem, imageDataList]);

  const currentIndexInGroup = useMemo(() => {
    if (!selectedItem || productGroup.length === 0) return 0;
    const idx = productGroup.findIndex(it => it.id === selectedItem.id);
    return idx >= 0 ? idx : 0;
  }, [selectedItem, productGroup]);

  // Reorder image to position #1 in Excel
  const handleSetAsFirst = useCallback(() => {
    if (!selectedItem || selectedItem.imgNo === 1) return;

    const firstItem = productGroup.find(it => it.imgNo === 1);
    if (!firstItem) return;

    // Swap links in excelData
    const rowIdx = selectedItem.rowIdx;
    setExcelData(prevData => {
      const newData = [...prevData];
      if (newData[rowIdx]) {
        const newRow = [...newData[rowIdx]];
        const tempVal = newRow[selectedItem.colIdx];
        newRow[selectedItem.colIdx] = newRow[firstItem.colIdx];
        newRow[firstItem.colIdx] = tempVal;
        newData[rowIdx] = newRow;
      }
      return newData;
    });

    // Swap links in imageDataList
    setImageDataList(prevList =>
      prevList.map(item => {
        if (item.id === selectedItem.id) {
          return { ...item, link: firstItem.link };
        }
        if (item.id === firstItem.id) {
          return { ...item, link: selectedItem.link };
        }
        return item;
      })
    );

    setSaveMessage('🥇 Image set as 1st Main Image in Excel!');
    setTimeout(() => setSaveMessage(''), 3000);
  }, [selectedItem, productGroup]);

  // Jump to next SKU product
  const handleKeepAndNextSKU = useCallback(() => {
    if (!selectedItem) return;

    const currentRowIdx = selectedItem.rowIdx;
    let nextRowIdx = -1;

    for (let r = currentRowIdx + 1; r < excelData.length; r++) {
      const hasImages = imageDataList.some(it => it.rowIdx === r && !it.deleted);
      if (hasImages) {
        nextRowIdx = r;
        break;
      }
    }

    if (nextRowIdx !== -1) {
      const nextItem = imageDataList.find(it => it.rowIdx === nextRowIdx && !it.deleted);
      if (nextItem) {
        setSelectedItemId(nextItem.id);
        updateLastCheckedItem(nextItem.id);
      }
    } else {
      setIsModalOpen(false);
    }
  }, [selectedItem, excelData.length, imageDataList, updateLastCheckedItem]);

  // Pagination & Progress Calculation
  const totalItemsCount = filteredGalleryItems.length;
  const itemsPerPage = 60; // 10 rows of 6 items
  const totalPages = Math.max(1, Math.ceil(totalItemsCount / itemsPerPage));
  const currentPage = Math.max(1, Math.min(totalPages, Math.floor(Math.max(0, scrollInfo.visibleIndex - 1) / itemsPerPage) + 1));
  const scrollProgressPct = Math.min(100, Math.round((scrollInfo.visibleIndex / Math.max(1, totalItemsCount)) * 100));
  const sidebarFileInputRef = useRef<HTMLInputElement>(null);

  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const handleJumpToPage = useCallback((pageNum: number) => {
    const target = Math.max(1, Math.min(totalPages, pageNum));
    const targetRow = (target - 1) * 10;
    galleryRef.current?.scrollToRow(targetRow);
  }, [totalPages]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpPageInput, 10);
    if (!isNaN(parsed)) {
      handleJumpToPage(parsed);
      setJumpPageInput('');
    }
  };

  const paginationRange = useMemo(() => {
    const delta = 1;
    const range: (number | string)[] = [];
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);

    range.push(1);
    if (left > 2) range.push('...');
    for (let i = left; i <= right; i++) {
      range.push(i);
    }
    if (right < totalPages - 1) range.push('...');
    if (totalPages > 1) range.push(totalPages);

    return range;
  }, [currentPage, totalPages]);

  return (
    <div className="h-screen h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-row font-sans antialiased selection:bg-amber-400 selection:text-slate-950 transition-colors duration-200">
      
      {/* Hidden Sidebar File Input */}
      <input
        type="file"
        ref={sidebarFileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFileUpload(file);
            e.target.value = '';
          }
        }}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Left Slim Navigation Rail (visible on tablet and desktop screens >= 768px) */}
      <aside className="hidden md:flex w-12 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col items-center py-2 justify-between z-30 select-none shadow-xs transition-colors">
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Amazon 'a' Brand Icon */}
          <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center shadow-sm">
            a
          </div>

          <div className="w-6 h-px bg-slate-200 dark:bg-slate-800" />

          {/* Gallery View */}
          <button
            onClick={() => setFilterStatus('all')}
            className={`p-2 rounded-xl transition-all ${
              filterStatus === 'all'
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="All Images Gallery"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Open Excel */}
          <button
            onClick={() => sidebarFileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            title="Open Excel Spreadsheet (.xlsx, .xls, .csv)"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>

          {/* Download Excel */}
          <button
            onClick={handleDownloadExcel}
            className="relative p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            title="Download Excel with Highlights"
          >
            <Download className="w-4 h-4" />
            {(highlightedRows.size > 0 || markedForDelete.size > 0) && (
              <span className="absolute top-0.5 right-0.5 bg-amber-400 text-slate-950 font-black text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-xs">
                {highlightedRows.size + markedForDelete.size}
              </span>
            )}
          </button>

          {/* Filter Layers */}
          <button
            onClick={() => setFilterStatus(filterStatus === 'frontend' ? 'all' : 'frontend')}
            className={`p-2 rounded-xl transition-all ${
              filterStatus === 'frontend'
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle Frontend Main Images Only"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Highlights Filter */}
          <button
            onClick={() => setFilterStatus('highlighted')}
            className={`relative p-2 rounded-xl transition-all ${
              filterStatus === 'highlighted'
                ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="View Highlighted Rows"
          >
            <Star className={`w-4 h-4 ${highlightedRows.size > 0 ? 'fill-amber-400 text-amber-400' : ''}`} />
            {highlightedRows.size > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-amber-400 text-slate-950 font-bold text-[8px] px-1 rounded-full">
                {highlightedRows.size}
              </span>
            )}
          </button>

          {/* Delete Marked Filter */}
          <button
            onClick={() => setFilterStatus('deleted')}
            className={`relative p-2 rounded-xl transition-all ${
              filterStatus === 'deleted'
                ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="View Marked for Delete"
          >
            <Trash2 className="w-4 h-4" />
            {markedForDelete.size > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-rose-600 text-white font-bold text-[8px] px-1 rounded-full">
                {markedForDelete.size}
              </span>
            )}
          </button>
        </div>

        {/* Bottom Rail: Progress gauge */}
        <div className="flex flex-col items-center gap-1">
          <div
            className="w-7 h-7 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400"
            title={`Scroll Progress: ${scrollProgressPct}%`}
          >
            {scrollProgressPct}%
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header with visibility controls */}
        <Header
          stats={stats}
          isLoading={isLoading}
          loadingMessage={loadingMessage}
          saveMessage={saveMessage}
          sessionSavedTime={sessionSavedTime}
          isHeaderVisible={isHeaderVisible}
          isNavbarVisible={isNavbarVisible}
          isAutoHide={isAutoHide}
          isCompact={isCompact}
          isDarkMode={isDarkMode}
          filterStatus={filterStatus}
          lastCheckedItem={lastCheckedItem}
          rowHandlePosition={rowHandlePosition}
          hasImgbbKey={hasImgbbKey}
          onOpenImgbbSettings={() => setIsImgbbModalOpen(true)}
          onToggleRowHandlePosition={handleToggleRowHandlePosition}
          onFilterStatusChange={setFilterStatus}
          onToggleTheme={handleToggleTheme}
          onToggleHeader={handleToggleHeader}
          onToggleNavbar={handleToggleNavbar}
          onToggleAutoHide={handleToggleAutoHide}
          onToggleCompact={handleToggleCompact}
          onToggleFullFocus={handleToggleFullFocus}
          onFileUpload={handleFileUpload}
          onLoadDemo={handleLoadDemo}
          onSaveChanges={handleSaveChanges}
          onManualSaveSession={handleManualSaveSession}
          onDownloadExcel={handleDownloadExcel}
          onClearMarks={handleClearMarks}
          onClearHighlights={handleClearHighlights}
          onGoToLastChecked={handleGoToLastChecked}
          onClearLastChecked={handleClearLastChecked}
          onBulkHighlightFiltered={handleBulkHighlightFiltered}
          onBulkDeleteFiltered={handleBulkDeleteFiltered}
          filteredCount={filteredGalleryItems.length}
        />

        {/* Main Gallery Body */}
        <main className="flex-1 w-full max-w-none px-2 sm:px-3 py-1 flex flex-col min-h-0 space-y-1.5 overflow-hidden">
          
          {/* Search and Filters Navbar (Conditionally rendered) */}
          {isNavbarVisible && (
            <SearchBar
              searchQuery={searchQuery}
              filterStatus={filterStatus}
              filteredCount={filteredGalleryItems.length}
              totalCount={stats.frontendCount}
              lastCheckedItem={lastCheckedItem}
              onSearchChange={setSearchQuery}
              onFilterStatusChange={setFilterStatus}
              onGoToLastChecked={handleGoToLastChecked}
              onClearLastChecked={handleClearLastChecked}
            />
          )}

          {/* Floating Restore Controls Pill when both Header & Navbar are hidden */}
          {!isHeaderVisible && !isNavbarVisible && (
            <div className="fixed top-3 right-5 z-50 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 border border-amber-500/40 p-1.5 rounded-2xl shadow-2xl backdrop-blur-md">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-bold px-2 flex items-center gap-1">
                ⚡ Full Grid Mode
              </span>
              <button
                onClick={() => { setIsHeaderVisible(true); setIsNavbarVisible(true); }}
                className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Show Header & Filters
              </button>
            </div>
          )}

          {/* Virtualized Gallery Grid Engine with Single-Click Whole Row Selection */}
          <VirtualGallery
            ref={galleryRef}
            items={filteredGalleryItems}
            allImageItems={imageDataList}
            highlightedRows={highlightedRows}
            markedForDelete={markedForDelete}
            lastCheckedItemId={lastCheckedItemId}
            rowHandlePosition={rowHandlePosition}
            removingBgItemId={removingBgItemId}
            onOpenModal={handleOpenModal}
            onToggleHighlight={handleToggleHighlight}
            onToggleDelete={handleToggleDelete}
            onOpenEditLink={handleOpenEditLink}
            onRemoveBg={handleRemoveBg}
            onScrollPosChange={(visibleIdx, total) => setScrollInfo({ visibleIndex: visibleIdx, total })}
            onScrollDirectionChange={handleScrollDirectionChange}
            onToggleRowDelete={handleToggleRowDelete}
            onDeleteRowDirect={handleDeleteRowDirect}
            onToggleRowHighlight={handleToggleRowHighlight}
            onClearLastChecked={handleClearLastChecked}
          />

          {/* Floating Batch Action Bar for Delete in Single Click */}
          {markedForDelete.size > 0 && (
            <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between sm:justify-center gap-2 sm:gap-2.5 bg-slate-900/95 dark:bg-slate-950/95 text-white border border-rose-500/60 px-3 sm:px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200 w-[94%] sm:w-auto max-w-lg">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400 truncate">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                <span className="truncate">{markedForDelete.size} {markedForDelete.size === 1 ? 'item' : 'items'} marked</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleSaveChanges}
                  className="px-2.5 sm:px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1 cursor-pointer"
                  title="Permanently remove all marked items from Excel in single click"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Marked</span>
                </button>
                <button
                  onClick={() => setMarkedForDelete(new Set())}
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
                  title="Cancel and unmark all items"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

        </main>

        {/* Bottom Status & Pagination Bar (matching user screenshot) */}
        <footer className="w-full bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 text-xs shadow-md">
          {/* Left: Last Checked & Scrolled Count */}
          <div className="flex items-center gap-2 font-mono">
            {lastCheckedItem && (
              <button
                onClick={handleGoToLastChecked}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-2.5 py-1 rounded-lg shadow-sm border border-amber-400 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                title="Jump directly to your last checked listing (Press 'L')"
              >
                <LocateFixed className="w-3 h-3 text-slate-950 animate-pulse" />
                <span>Last</span>
                <span className="bg-slate-950/20 text-slate-950 font-mono text-[10px] px-1 rounded font-black">
                  #{lastCheckedItem.rowIdx}
                </span>
              </button>
            )}

            {totalItemsCount > 0 && (
              <span className="text-slate-600 dark:text-slate-400 text-xs hidden xs:inline">
                Scrolled: <strong className="text-slate-800 dark:text-slate-200">{scrollInfo.visibleIndex.toLocaleString()}</strong> / {totalItemsCount.toLocaleString()}
              </span>
            )}
          </div>

          {/* Right: Pagination Navigation */}
          <div className="flex items-center gap-1">
            {totalPages > 1 && (
              <>
                <button
                  onClick={() => handleJumpToPage(1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleJumpToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Mobile compact page indicator */}
                <span className="sm:hidden text-xs font-mono font-semibold px-2 text-slate-700 dark:text-slate-300">
                  {currentPage} / {totalPages}
                </span>

                {/* Tablet and Desktop full page pills */}
                <div className="hidden sm:flex items-center gap-1">
                  {paginationRange.map((p, idx) => (
                    typeof p === 'number' ? (
                      <button
                        key={`page-${p}`}
                        onClick={() => handleJumpToPage(p)}
                        className={`min-w-6 h-6 px-1.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                          p === currentPage
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={`dots-${idx}`} className="text-slate-400 text-xs px-0.5">...</span>
                    )
                  ))}
                </div>

                <button
                  onClick={() => handleJumpToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleJumpToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400 transition-colors"
                  title="Last Page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>

                {/* Go to page form */}
                <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 ml-2 text-xs text-slate-500 font-mono">
                  <span>Go:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(currentPage)}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className="w-12 h-6 text-center text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1 text-slate-800 dark:text-slate-200"
                  />
                  <span>/ {totalPages}</span>
                </form>
              </>
            )}

            {/* Back to top purple button */}
            <button
              onClick={() => galleryRef.current?.scrollToTop()}
              className="p-1.5 ml-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-sm transition-all cursor-pointer"
              title="Scroll to Top"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </footer>
      </div>

      {/* Per-Product Carousel Modal */}
      <ModalViewer
        isOpen={isModalOpen}
        item={selectedItem}
        productGroup={productGroup}
        currentIndexInGroup={currentIndexInGroup}
        totalImagesCount={stats.totalImages}
        markedDeleteCount={stats.markedDeleteCount}
        highlightedCount={stats.highlightedRowsCount}
        isMarkedDelete={selectedItem ? markedForDelete.has(selectedItem.id) : false}
        isHighlighted={selectedItem ? highlightedRows.has(selectedItem.rowIdx) : false}
        isRemovingBg={selectedItem ? removingBgItemId === selectedItem.id : false}
        onClose={() => setIsModalOpen(false)}
        onNavigateGroup={(pos) => {
          if (productGroup[pos]) {
            setSelectedItemId(productGroup[pos].id);
            updateLastCheckedItem(productGroup[pos].id);
          }
        }}
        onDeleteCurrent={() => selectedItem && handleToggleDelete(selectedItem.id)}
        onHighlightCurrent={() => selectedItem && handleToggleHighlight(selectedItem.rowIdx)}
        onSetAsFirst={handleSetAsFirst}
        onKeepAndNextSKU={handleKeepAndNextSKU}
        onOpenEditLink={(item) => handleOpenEditLink(item)}
        onOpenEditMetadata={(item) => handleOpenEditMetadata(item)}
        onRemoveBg={handleRemoveBg}
        onRevertLink={handleRevertLink}
        onOpenImgbbSettings={() => setIsImgbbModalOpen(true)}
      />

      {/* Edit Link Modal */}
      <EditLinkModal
        item={editingItem}
        isOpen={isEditLinkModalOpen}
        onClose={() => setIsEditLinkModalOpen(false)}
        onSaveLink={handleSaveLink}
        onOpenImgbbSettings={() => setIsImgbbModalOpen(true)}
      />

      {/* Edit Material, Category & Title Metadata Modal */}
      <EditProductMetadataModal
        item={editingMetaItem}
        isOpen={isEditMetaModalOpen}
        onClose={() => setIsEditMetaModalOpen(false)}
        onSaveMetadata={handleSaveProductMetadata}
      />

      {/* ImgBB API Key Configuration & Link Generator Modal */}
      <ImgbbKeyModal
        isOpen={isImgbbModalOpen}
        onClose={() => setIsImgbbModalOpen(false)}
        onKeyUpdated={(key) => setHasImgbbKey(Boolean(key))}
      />

    </div>
  );
}
