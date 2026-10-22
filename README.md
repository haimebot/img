# Amazon Image Viewer & Product Studio (img3.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4.0-38bdf8.svg)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%20%7C%20v22-green.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-emerald.svg)]()

> A high-performance, enterprise-grade e-commerce catalog visualizer, image auditor, AI background remover, batch Excel editor, and multi-cloud asset manager. Built specifically for Amazon sellers, catalog specialists, QA teams, and e-commerce agencies dealing with thousands of product listings.

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Key Capabilities & Highlights](#2-key-capabilities--highlights)
3. [System Architecture & Flow](#3-system-architecture--flow)
4. [Deep-Dive Feature Breakdown](#4-deep-dive-feature-breakdown)
   - [Excel Catalog Ingestion & Smart Column Detection](#excel-catalog-ingestion--smart-column-detection)
   - [Virtual Gallery & 60 FPS Rendering Pipeline](#virtual-gallery--60-fps-rendering-pipeline)
   - [High-Performance Cross-Browser Image Proxy](#high-performance-cross-browser-image-proxy)
   - [Interactive Modal Inspector & Hardware Slideshow](#interactive-modal-inspector--hardware-slideshow)
   - [1-Click AI Background Removal & Amazon Pure White Generator](#1-click-ai-background-removal--amazon-pure-white-generator)
   - [ImgBB Cloud Image Hosting Integration](#imgbb-cloud-image-hosting-integration)
   - [Metadata & URL Editing Studio](#metadata--url-editing-studio)
   - [IndexedDB Persistence & Last-Checked Checkpoint](#indexeddb-persistence--last-checked-checkpoint)
   - [Clean Excel Export Engine](#clean-excel-export-engine)
5. [Keyboard Shortcuts Reference](#5-keyboard-shortcuts-reference)
6. [Backend API Reference](#6-backend-api-reference)
7. [Directory & File Structure](#7-directory--file-structure)
8. [Getting Started (Local Development)](#8-getting-started-local-development)
9. [Multi-Platform Deployment Guide](#9-multi-platform-deployment-guide)
   - [Zoho Catalyst (Slate & AppSail)](#zoho-catalyst-slate--appsail)
   - [Docker Deployment](#docker-deployment)
   - [Vercel & Netlify](#vercel--netlify)
   - [Render / Railway / Heroku](#render--railway--heroku)
   - [Linux VPS (Ubuntu/Debian with Nginx & PM2)](#linux-vps-ubuntudebian-with-nginx--pm2)
10. [Configuration & Environment Variables](#10-configuration--environment-variables)
11. [Troubleshooting & FAQ](#11-troubleshooting--faq)

---

## 1. Overview & Purpose

Managing Amazon product image feeds, flat files, and bulk catalogs via spreadsheets is tedious and prone to errors. Broken URLs, non-compliant background colors, incorrect aspect ratios, and missing variant photos can suppress Amazon listings and cost thousands in lost revenue.

**Amazon Image Viewer & Product Studio** solves this by bridging the gap between raw Excel flat files (`.xlsx`, `.xls`, `.csv`) and visual quality inspection. It parses complex multi-column spreadsheets, groups all image assets per SKU, dynamically tests image health, provides real-time AI background removal (compliant with Amazon's `#FFFFFF` pure white standard), hosts cutouts on ImgBB with permanent HTTPS links, and updates your Excel flat file with a single click.

---

## 2. Key Capabilities & Highlights

- **Massive Spreadsheet Support:** Effortlessly handles catalogs with **10,000+ image rows** using virtualized DOM windowing and zero-lag DOM recycling.
- **Cross-Browser Resilience:** Resolves Chrome, Brave, Edge, Safari, and Firefox strict privacy/CORB (Cross-Origin Read Blocking) restrictions with server-side proxy streaming and magic-byte MIME detection.
- **Instant 60FPS Carousel:** Hardware-accelerated image transitions with predictive adjacent preloading (next 2 slides + previous slide) for seamless, instantaneous switching without slide lag.
- **1-Click AI Background Removal:** Built-in integration with Remove.bg API + automated fallbacks to convert product photos to Amazon pure white (`#FFFFFF`) or transparent PNGs.
- **Direct ImgBB Cloud Hosting:** Automatically uploads cutouts or revised images to ImgBB (`api.imgbb.com/1/upload`), retrieves permanent CDN links (`https://i.ibb.co/...`), and writes them directly into your catalog data.
- **Last-Checked Checkpoint Tracker:** Never lose your spot in massive catalogs. Remembers exactly where you left off, allowing 1-click resumption.
- **Dual Persistence Architecture:** Client-side IndexedDB database (`AmazonImageViewerDB`) preserves your entire working catalog, edited links, and row marks across browser reloads.
- **Clean Excel Export:** Exports updated spreadsheets using ExcelJS, preserving existing formulas, metadata, and column order while cleanly applying modified links or removing deleted items.

---

## 3. System Architecture & Flow

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                               USER BROWSER                                  │
 │                                                                             │
 │  ┌───────────────────────┐   Upload   ┌──────────────────────────────────┐  │
 │  │   Excel File (.xlsx)  │ ─────────> │   Excel Parsing & Auto-Detect    │  │
 │  └───────────────────────┘            └─────────────────┬────────────────┘  │
 │                                                         │                   │
 │                                                         ▼                   │
 │  ┌───────────────────────┐            ┌──────────────────────────────────┐  │
 │  │ IndexedDB Persistence │ <────────> │   Virtualized Gallery (App.tsx)  │  │
 │  └───────────────────────┘            └─────────────────┬────────────────┘  │
 │                                                         │                   │
 │                                Open Inspector           ▼                   │
 │  ┌───────────────────────┐            ┌──────────────────────────────────┐  │
 │  │  Keyboard Navigation  │ ─────────> │   Modal Viewer (60fps Carousel)  │  │
 │  │  (←, →, Space, Del, H)│            └──────────────┬──────────┬────────┘  │
 └──────────────────────────────────────────────────────┼──────────┼───────────┘
                                                        │          │
                     Direct Fetch / Proxy Fallback      │          │ Remove BG / Upload
                                                        ▼          ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         EXPRESS NODE.JS BACKEND                             │
 │                                                                             │
 │  ┌───────────────────────────────────────────────────────────────────────┐  │
 │  │  /api/proxy-image & /api/proxy-img                                    │  │
 │  │  • Magic Byte Sniffing (JPEG, PNG, WebP, AVIF)                        │  │
 │  │  • In-Memory Proxy LRU Cache (1,500 entries)                          │  │
 │  │  • Edge CDN Acceleration Fallback (weserv.nl)                         │  │
 │  └───────────────────────────────────────────────────────────────────────┘  │
 │                                                                             │
 │  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
 │  │  /api/remove-bg                 │   │  /api/upload-imgbb              │  │
 │  │  • Remove.bg API Proxy          │   │  • ImgBB REST API Gateway       │  │
 │  │  • Amazon Pure White (#FFFFFF)  │   │  • Primary & Backup API Keys    │  │
 │  │  • In-Memory Hosted Fallback    │   │  • Direct HTTPS link return     │  │
 │  └─────────────────────────────────┘   └─────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────┘
                                   │                              │
                                   ▼                              ▼
                      ┌─────────────────────────┐    ┌─────────────────────────┐
                      │    Remove.bg Services   │    │   ImgBB Cloud Storage   │
                      └─────────────────────────┘    └─────────────────────────┘
```

---

## 4. Deep-Dive Feature Breakdown

### Excel Catalog Ingestion & Smart Column Detection
The parsing system (`src/utils/excelHelper.ts`) reads Excel flat files via SheetJS (`xlsx`) and automatically analyzes header patterns:
- **SKU Identification:** Scans for columns labeled `sku`, `item_sku`, `seller_sku`, `asin`, `item_id`, `product_id`, or defaults to Column A.
- **Frontend / Main Image:** Identifies primary public-facing images by scanning for `image path`, `main_image_url`, `image_url`, or the first valid URL column.
- **Backend / Secondary Images:** Maps additional columns (`other_image_url1`, `image2`, `additional_image`, etc.) to sequentially numbered product images (`imgNo: 2, 3, 4...`).
- **Product Metadata Columns:** Extracts `title`, `category`, `material`, and `package includes` to provide complete context during visual audits.
- **URL Sanitization:** Strips trailing whitespace, resolves protocol-less URLs (`//m.media-amazon.com/...` -> `https://m.media-amazon.com/...`), fixes unencoded spaces, and automatically upgrades legacy Amazon HTTP URLs to secure HTTPS.

### Virtual Gallery & 60 FPS Rendering Pipeline
The gallery (`src/components/VirtualGallery.tsx`) employs a high-performance virtual windowing technique:
- **DOM Node Recycling:** Only the rows currently visible within the browser viewport are mounted in the DOM. This allows catalogs with thousands of items to run at a consistent 60 FPS with minimal memory consumption.
- **Row-Grouped Architecture:** Each row represents a single SKU with its primary image highlighted and secondary gallery images arrayed cleanly alongside it.
- **Flexible Row Controls:** Features a configurable Row Action Handle (toggleable between **Left** and **Right** alignment) to suit both left-handed and right-handed inspection workflows.
- **Instant Status Filtering:** Filter by `Frontend Only`, `Highlighted`, `Marked for Delete`, `Edited Links`, or `Broken Images`.

### High-Performance Cross-Browser Image Proxy
Modern browsers like Chrome and Brave enforce strict **CORB (Cross-Origin Read Blocking)** and privacy protections that block direct image loading or canvas reading across third-party CDNs.

Our backend proxy (`server.ts`) guarantees reliable loading:
1. **Magic Byte Header Sniffing:** Examines raw byte signatures (JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46`, WebP `RIFF...WEBP`) to guarantee valid `Content-Type` headers even when upstream CDNs return generic `application/octet-stream`.
2. **LRU In-Memory Cache:** Keeps up to 1,500 frequently requested images in RAM for instant, sub-millisecond retrieval.
3. **Multi-Stage Upstream Cascade:**
   - Attempt 1: Direct fetch with Amazon/CDN-compatible browser headers.
   - Attempt 2: Fallback with generic `curl` user-agent to bypass basic bot shields.
   - Attempt 3: Accelerated edge proxy via Cloudflare-backed image workers (`weserv.nl`).

### Interactive Modal Inspector & Hardware Slideshow
Clicking any image opens the Modal Inspector (`src/components/ModalViewer.tsx`):
- **Hardware-Accelerated Carousel:** Uses CSS transforms (`translateX(-N%)`) with `will-change: transform` to eliminate layout thrashing and deliver smooth frame rates.
- **Predictive Preloading:** When viewing Slide *N*, the inspector preloads Slide *N+1*, *N+2*, and *N-1* into browser memory in the background.
- **Auto-Slideshow Player:** Includes playback controls with selectable interval presets:
  - `0.5s` Turbo
  - `1.0s` Fast
  - `1.5s` Normal (Default)
  - `2.5s` Relaxed
  - `4.0s` Slow
- **Touch Gestures:** Native touch-event listeners enable smooth swipe-left and swipe-right navigation on tablets and touch laptops.

### 1-Click AI Background Removal & Amazon Pure White Generator
Amazon requires main listing images to feature a pure white background (RGB `255, 255, 255` / `#FFFFFF`).
- **One-Click Execution:** Click **Pure White** in the inspector to process the active image through Remove.bg's official API.
- **Automatic Fallback Pipeline:** If external API credits are exhausted or an upstream CDN blocks incoming requests, the system automatically retrieves the binary buffer server-side and applies in-browser canvas segmentation, preventing workflow interruption.
- **Undo / Revert Support:** Easily revert to the original URL at any time with a single click.

### ImgBB Cloud Image Hosting Integration
When an image is processed or edited, it needs a reliable public HTTPS URL to insert into your Amazon flat file:
- Sends images directly to `https://api.imgbb.com/1/upload`.
- Features built-in primary and backup API keys, with support for custom user API keys via the **ImgBB Settings Modal**.
- Returns permanent, high-speed CDN URLs (`https://i.ibb.co/...`) and automatically updates the active catalog record.

### Metadata & URL Editing Studio
- **Edit Link Modal (`EditLinkModal.tsx`):** Paste any new image link, test it with a live real-time preview, upload files directly, and update the catalog immediately.
- **Edit Metadata Modal (`EditProductMetadataModal.tsx`):** Modify SKU, Title, Category, Material, and Package Includes in real time without having to open Excel.

### IndexedDB Persistence & Last-Checked Checkpoint
- **Local Database (`AmazonImageViewerDB`):** Automatically saves your working session, modified links, highlighted rows, and deletion marks into browser IndexedDB.
- **Last-Checked Tracker:** Clicking or inspecting a product marks it as your active checkpoint. A dedicated button in the header lets you jump directly back to that product at any point.

### Clean Excel Export Engine
Clicking **Download Excel** runs an export routine powered by `ExcelJS`:
- Retains original workbook structure, sheets, and headers.
- Updates cells with newly generated ImgBB or modified image URLs.
- Clears deleted image entries or excludes marked rows based on your settings.
- Produces clean files ready for Amazon Seller Central flat-file uploads.

---

## 5. Keyboard Shortcuts Reference

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `←` (Left Arrow) | Navigate to previous image in product group | Modal Inspector |
| `→` (Right Arrow) | Navigate to next image in product group | Modal Inspector |
| `Space` | Play / Pause auto-slideshow | Modal Inspector |
| `[` | Decrease slideshow speed (faster transition) | Modal Inspector |
| `]` | Increase slideshow speed (slower transition) | Modal Inspector |
| `Del` | Mark current image for deletion | Modal Inspector |
| `H` / `h` | Toggle highlight on current product SKU row | Modal Inspector |
| `Enter` | Keep current image & immediately jump to next SKU | Modal Inspector |
| `E` / `e` | Open Edit Link Modal | Modal Inspector |
| `M` / `m` | Open Edit Product Metadata Modal | Modal Inspector |
| `Esc` | Close modal inspector | Modal Inspector |

---

## 6. Backend API Reference

### Health Check
```http
GET /api/health
```
**Response:**
```json
{
  "status": "ok",
  "app": "Amazon Image Viewer"
}
```

---

### Image Proxy Stream
```http
GET /api/proxy-image?url={encoded_image_url}
GET /api/proxy-img?url={encoded_image_url}&w={width}
```
**Headers Returned:**
- `Content-Type`: Automatically detected MIME (`image/jpeg`, `image/png`, `image/webp`, `image/avif`)
- `Cache-Control`: `public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`
- `Access-Control-Allow-Origin`: `*`
- `Cross-Origin-Resource-Policy`: `cross-origin`

---

### 1-Click AI Background Removal
```http
POST /api/remove-bg
Content-Type: application/json
```
**Request Body:**
```json
{
  "imageUrl": "https://m.media-amazon.com/images/I/71xyz.jpg",
  "bgColor": "white",
  "removeBgKey": "optional_custom_key",
  "imgbbKey": "optional_custom_key"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Background successfully removed & uploaded to ImgBB",
  "link": "https://i.ibb.co/xyz/cutout.jpg",
  "imgbbUrl": "https://i.ibb.co/xyz/cutout.jpg",
  "dataUri": "data:image/jpeg;base64,...",
  "mimeType": "image/jpeg",
  "sizeBytes": 348210
}
```

---

### Direct ImgBB Cloud Upload
```http
POST /api/upload-imgbb
Content-Type: application/json
```
**Request Body:**
```json
{
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "name": "SKU_12345_MAIN",
  "key": "optional_custom_imgbb_api_key"
}
```
**Response:**
```json
{
  "success": true,
  "url": "https://i.ibb.co/abcdef/SKU_12345_MAIN.png",
  "displayUrl": "https://i.ibb.co/abcdef/SKU_12345_MAIN.png",
  "deleteUrl": "https://imgbb.com/delete/..."
}
```

---

## 7. Directory & File Structure

```text
├── .env.example                    # Environment variable template
├── app-config.json                 # Zoho Catalyst configuration
├── catalyst.json                   # Zoho Catalyst project definition
├── Dockerfile                      # Production multi-stage Docker build
├── netlify.toml                    # Netlify deployment configuration
├── render.yaml                     # Render deployment configuration
├── vercel.json                     # Vercel deployment configuration
├── Procfile                        # Heroku / Railway process file
├── package.json                    # Project metadata, scripts & dependencies
├── package-lock.json               # Locked dependency tree
├── server.ts                       # Express backend: proxy, Remove.bg & ImgBB APIs
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite client configuration
├── dist/                           # Compiled production output
│   ├── index.html                  # Minified client HTML
│   ├── assets/                     # Bundled JS/CSS bundles
│   └── server.cjs                  # Bundled Node.js backend
└── src/
    ├── main.tsx                    # React application entry point
    ├── App.tsx                     # Main application orchestrator & state manager
    ├── types.ts                    # TypeScript data models & interfaces
    ├── index.css                   # Tailwind CSS imports & global utilities
    ├── components/
    │   ├── Header.tsx              # Top navigation bar, stats, filters & controls
    │   ├── VirtualGallery.tsx      # Windowed 60fps SKU product grid
    │   ├── ImageCard.tsx           # Individual product image card with actions
    │   ├── ModalViewer.tsx         # Hardware-accelerated slideshow modal
    │   ├── EditLinkModal.tsx       # URL editing & live preview modal
    │   ├── EditProductMetadataModal.tsx # SKU, Title & metadata editor modal
    │   ├── ImgbbKeyModal.tsx       # ImgBB API key configuration modal
    │   └── SearchBar.tsx           # Live search input component
    └── utils/
        ├── excelHelper.ts          # Excel parsing, column detection & export
        ├── imageHelper.ts          # URL cleaning, validation & client fallbacks
        └── idbHelper.ts            # IndexedDB session persistence helper
```

---

## 8. Getting Started (Local Development)

### Prerequisites
- **Node.js**: Version 20.x or 22.x LTS installed.
- **npm**: Version 9.x or higher.

### Quickstart

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd amazon-image-viewer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables (Optional):**
   ```bash
   cp .env.example .env
   ```
   Add your optional custom keys in `.env` if desired:
   ```env
   PORT=3000
   NODE_ENV=development
   REMOVE_BG_API_KEY=your_key_here
   IMGBB_API_KEY=your_key_here
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. The app runs with full hot-reloading and Express proxy middleware.

---

## 9. Multi-Platform Deployment Guide

### Zoho Catalyst (Slate & AppSail)

This repository includes pre-configured `app-config.json` and `catalyst.json` to ensure automated deployment without build errors.

1. **Deploying as Catalyst Slate (Client Web App):**
   Ensure your build command is configured as:
   ```bash
   npm run build
   ```
   Catalyst will compile the static bundle to `dist/` and serve it through the Slate CDN edge.

2. **Deploying as Catalyst AppSail (Full-Stack Node.js Service):**
   - Runtime: `Node 20` or `Node 22`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`

---

### Docker Deployment

A production-grade, multi-stage Docker build is provided:

```dockerfile
# Build image
docker build -t amazon-image-viewer .

# Run container
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  --name amazon-image-viewer \
  amazon-image-viewer
```
Visit [http://localhost:3000](http://localhost:3000).

---

### Vercel & Netlify

#### Vercel
Configuration is pre-set in `vercel.json`. Connect your repository to Vercel:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

#### Netlify
Configuration is pre-set in `netlify.toml`:
- **Build Command:** `npm run build`
- **Publish Directory:** `dist`

---

### Render / Railway / Heroku

These cloud PaaS providers look for `Procfile` or `package.json` scripts:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run start`
- Set `PORT` to default or allow the platform to assign it automatically.

---

### Linux VPS (Ubuntu/Debian with Nginx & PM2)

1. **Build the production bundle on your server:**
   ```bash
   npm install
   npm run build
   ```

2. **Run with PM2:**
   ```bash
   npm install -g pm2
   pm2 start dist/server.cjs --name "amazon-image-viewer" -i max
   pm2 save
   pm2 startup
   ```

3. **Configure Nginx Reverse Proxy (`/etc/nginx/sites-available/image-viewer`):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       client_max_body_size 50M;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
4. **Enable SSL with Certbot:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

---

## 10. Configuration & Environment Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3000` | Port for the Express server to listen on. |
| `NODE_ENV` | String | `development` | Environment mode (`development` or `production`). |
| `REMOVE_BG_API_KEY` | String | *Built-in fallback* | API Key for Remove.bg background removal service. |
| `IMGBB_API_KEY` | String | *Built-in fallback* | API Key for ImgBB image hosting service. |

*Note: Users can also input their own custom API keys directly within the app UI (stored locally in `localStorage`).*

---

## 11. Troubleshooting & FAQ

#### Why do some images fail to load in Chrome or Brave?
Brave Shields and Chrome privacy features block cross-origin third-party tracking pixels and images that lack explicit CORS headers or MIME types. Our application automatically reroutes blocked images through `/api/proxy-image`, which analyzes magic bytes and returns standard CORS headers (`Access-Control-Allow-Origin: *`) to ensure reliable display.

#### Can I upload spreadsheets with 20,000+ rows?
Yes. Thanks to virtualized windowing, only the items currently visible on screen are rendered in the browser DOM. Memory usage remains stable regardless of catalog size.

#### How does the "Last Checked" feature work?
Whenever you inspect or interact with an image card, its ID is saved in `localStorage`. Clicking **Resume from Last Checked** in the header scrolls you back to that exact item, even after closing and reopening your browser.

#### What happens if Remove.bg runs out of free credits?
If the Remove.bg API returns an error or quota exhaustion warning, the server notifies the client gracefully and falls back to our in-browser canvas extraction routine. This ensures that you can always continue working without losing your place.

#### How do I keep formulas intact when exporting back to Excel?
The exporter uses `ExcelJS` to read the original spreadsheet file in memory, update only the target image columns and deleted row states, and write out the result—preserving your existing sheet names, column widths, and formulas.

---

## License

MIT License. Free for commercial and private use.