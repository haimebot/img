# Frontend Source Architecture (`src/`)

This directory contains the client-side React 19 Single Page Application (SPA), written in TypeScript and styled with Tailwind CSS.

---

## 📂 Directory Layout

```
src/
├── App.tsx                        # Main state container & event coordinator
├── index.css                      # Global styles & Tailwind CSS rules
├── main.tsx                       # React DOM root entrypoint
├── README.md                      # This architecture guide
├── types.ts                       # Domain types & interfaces
│
├── components/                    # UI Components
│   ├── EditLinkModal.tsx          # Image URL editor with ImgBB integration
│   ├── EditProductMetadataModal.tsx # Product metadata editor (Material, Category, Title)
│   ├── Header.tsx                 # App header, toolbar & statistics counters
│   ├── ImageCard.tsx              # Grid image card with lazy loading & actions
│   ├── ImgbbKeyModal.tsx          # API key manager (ImgBB & Remove.bg)
│   ├── ModalViewer.tsx            # Full-screen carousel & image inspector
│   ├── SearchBar.tsx              # Filter pills & SKU/attribute search
│   └── VirtualGallery.tsx         # Virtualized grid engine for 500k+ rows
│
└── utils/                         # Processing Engines
    ├── excelHelper.ts             # XLSX parsing & ExcelJS styled exporter
    ├── idbHelper.ts               # IndexedDB asynchronous session persistence
    └── imageHelper.ts             # CDN acceleration, Canvas removal & ImgBB fallbacks
```

---

## 📄 File Details

### Core Files
- **`main.tsx`**: Creates the React root with `createRoot(document.getElementById('root')!)` and mounts `<App />`.
- **`App.tsx`**: Central state hub:
  - Manages `excelData` (2D spreadsheet matrix), `imageDataList` (normalized item list), `highlightedRows` (yellow row set), and `markedForDelete` (deletion set).
  - Handles drag-and-drop file imports and session loading.
  - Automatically syncs spreadsheet modifications with IndexedDB.
  - Global keyboard listener for carousel (`← / →`), mark delete (`Del`), highlight (`H`), and modal triggers.
- **`types.ts`**: TypeScript contracts including `ImageItem`, `AppStats`, `FilterStatus`, and `SavedState`.
- **`index.css`**: Tailwind CSS integration (`@import "tailwindcss";`), custom slim scrollbar styles, badge transitions, and image containment rules.

### Components (`components/`)
- **`VirtualGallery.tsx`**: High-performance virtualized grid calculating viewport height, row spacing, and dynamic item slicing. Supports grouping by SKU, batch row deletion, and whole-row highlighting.
- **`ImageCard.tsx`**: Lazy-loaded image card with edge-accelerated CDN links (`images.weserv.nl`), deletion strike badges, link edit triggers, and 1-click background removal.
- **`ModalViewer.tsx`**: Full-screen modal with image carousel, keyboard navigation, 1-click background removal, and quick metadata view.
- **`Header.tsx`**: Top navigation with file upload, demo data buttons, IndexedDB manual save/clear, bulk row deletion and bulk highlighting actions for filtered items, SKU/image statistics, and styled `.xlsx` export.
- **`SearchBar.tsx`**: Search input with debouncing and filter pills for instant catalog filtering.
- **`EditLinkModal.tsx`**: URL replacement dialog with live preview and direct ImgBB cloud upload button.
- **`EditProductMetadataModal.tsx`**: Metadata editor for Material, Category, Title, and Package Includes, dynamically appending columns to Excel data when needed.
- **`ImgbbKeyModal.tsx`**: Key manager for saving and verifying ImgBB and Remove.bg API keys in `localStorage`.

### Utilities (`utils/`)
- **`excelHelper.ts`**: Fast binary sheet parsing (`xlsx`) and styled workbook creation (`exceljs`) preserving yellow highlights (`#FFFF00`).
- **`idbHelper.ts`**: Asynchronous IndexedDB storage engine for saving and restoring massive datasets.
- **`imageHelper.ts`**: Multi-tiered image processing engine with global edge acceleration, client-side Canvas background removal, and direct-to-ImgBB browser uploads.
