# Vercel Serverless Functions (`api/`)

This directory contains standalone serverless edge functions that deploy automatically to Vercel (or any serverless environment compatible with Vercel API functions).

---

## 📂 Files in this Directory

| File | Route | Method | Description |
| :--- | :--- | :--- | :--- |
| `remove-bg.ts` | `/api/remove-bg` | `POST` | AI-powered background removal via Remove.bg with automatic white compositing & ImgBB link generation |
| `upload-imgbb.ts` | `/api/upload-imgbb` | `POST` | Cloud image uploader to ImgBB CDN (`https://i.ibb.co/...`) |
| `proxy-image.ts` | `/api/proxy-image` | `GET`, `POST` | High-speed edge-cached CORS proxy streaming binary images or Base64 Data URIs |

---

## 📄 File Details

### 1. `remove-bg.ts`
- **Path**: `/api/remove-bg.ts`
- **HTTP Method**: `POST` (Supports `OPTIONS` preflight)
- **CORS Support**: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,OPTIONS,PATCH,DELETE,POST,PUT`
- **Request Body (JSON)**:
  ```json
  {
    "imageUrl": "https://example.com/product.jpg",
    "bgColor": "white",
    "size": "auto",
    "name": "AMZ_100001_main",
    "removeBgKey": "optional_client_key",
    "imgbbKey": "optional_client_key"
  }
  ```
- **Response (JSON)**:
  ```json
  {
    "success": true,
    "dataUri": "data:image/jpeg;base64,...",
    "link": "https://i.ibb.co/...",
    "imgbbUrl": "https://i.ibb.co/...",
    "imgbbDisplayUrl": "https://ibb.co/...",
    "mimeType": "image/jpeg",
    "sizeBytes": 145020
  }
  ```
- **Behavior**:
  - Validates input `imageUrl`.
  - Sends request to Remove.bg API (`https://api.remove.bg/v1.0/removebg`).
  - Composites background to Amazon-compliant pure studio white (`#FFFFFF`) or transparent.
  - Automatically posts the output to ImgBB to generate a permanent link.
  - Returns both base64 `dataUri` and the permanent ImgBB link.

---

### 2. `upload-imgbb.ts`
- **Path**: `/api/upload-imgbb.ts`
- **HTTP Method**: `POST` (Supports `OPTIONS` preflight)
- **Request Body (JSON)**:
  ```json
  {
    "image": "base64_string_or_data_uri_or_url",
    "name": "product_sku_image",
    "key": "optional_override_key"
  }
  ```
- **Response (JSON)**:
  ```json
  {
    "success": true,
    "url": "https://i.ibb.co/xyz/image.jpg",
    "display_url": "https://ibb.co/xyz",
    "thumb_url": "https://i.ibb.co/xyz/thumb.jpg",
    "delete_url": "https://ibb.co/xyz/delete_token",
    "id": "xyz"
  }
  ```
- **Behavior**:
  - Sanitizes base64 input (strips `data:image/...;base64,` header).
  - Sanitizes image name (replaces non-alphanumeric characters with `_`).
  - Calls `https://api.imgbb.com/1/upload` with `application/x-www-form-urlencoded` encoding.
  - Returns permanent image URLs.

---

### 3. `proxy-image.ts`
- **Path**: `/api/proxy-image.ts`
- **HTTP Methods**: `GET` (binary stream), `POST` (JSON dataUri)
- **Edge Caching**: `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`
- **Parameters**: `url` or `imageUrl` (supports query params or JSON body)
- **Behavior**:
  - Fetches the remote image server-side with CDN fallback acceleration.
  - Streaming binary response for GET (acts as direct `<img src="/api/proxy-image?url=...">` proxy).
  - JSON response `{ success: true, dataUri }` for POST or `format=json`.
  - Sets `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`.
  - Enables HTML5 Canvas `ctx.drawImage()` and `ctx.getImageData()` without CORS taint errors.
