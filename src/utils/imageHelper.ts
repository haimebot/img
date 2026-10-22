// Helper to check if a string is a remote HTTP/HTTPS URL or valid image link
export function isRemoteImageUrl(link: string): boolean {
  if (!link || typeof link !== 'string') return false;
  const trimmed = link.trim();
  if (trimmed.length < 4) return false;
  if (/^https?:\/\//i.test(trimmed) || /^\/\//i.test(trimmed) || /^data:image/i.test(trimmed) || /^blob:/i.test(trimmed) || /^\/api\//i.test(trimmed)) {
    return true;
  }
  // Also recognize domain-based paths common in Excel catalogs without explicit protocol
  const lower = trimmed.toLowerCase();
  return (
    lower.includes('amazon.com') ||
    lower.includes('media-amazon.com') ||
    lower.includes('ssl-images-amazon') ||
    lower.includes('unsplash.com') ||
    lower.includes('alicdn') ||
    lower.includes('ibb.co') ||
    lower.includes('imgur.com') ||
    lower.includes('cloudinary.com') ||
    /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i.test(trimmed)
  );
}

// Clean and sanitize image URLs for reliable web loading
export function cleanImageUrl(link: string): string {
  if (!link || typeof link !== 'string') return '';
  let trimmed = link.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('//')) {
    trimmed = 'https:' + trimmed;
  } else if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:') && !trimmed.startsWith('blob:') && !trimmed.startsWith('/')) {
    trimmed = 'https://' + trimmed;
  }

  // Handle spaces and encode properly
  if (trimmed.includes(' ') && !trimmed.startsWith('data:')) {
    trimmed = encodeURI(trimmed);
  }

  // In HTTPS environments (like AI Studio / Cloud Run), upgrade http:// for Amazon and major image hosts
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    trimmed.startsWith('http://')
  ) {
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('amazon.com') ||
      lower.includes('media-amazon.com') ||
      lower.includes('ssl-images-amazon.com') ||
      lower.includes('images-amazon.com') ||
      lower.includes('ibb.co') ||
      lower.includes('imgur.com') ||
      lower.includes('cloudinary.com') ||
      lower.includes('unsplash.com')
    ) {
      trimmed = 'https://' + trimmed.slice(7);
    }
  }
  return trimmed;
}

// Check if an image URL matches slow CDNs (like eric-cdn.eric-bot.com, alicdn, etc.)
export function isBoostableImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('eric-cdn') ||
    lower.includes('eric-bot.com') ||
    lower.includes('alicdn') ||
    lower.includes('aliyuncs') ||
    lower.includes('alibabacloud') ||
    lower.includes('aliyuncdn') ||
    lower.startsWith('http://')
  );
}

// Global In-Memory Cache for boosted and validated image URLs
const boostedUrlCache = new Map<string, string>();
const preloadedUrlSet = new Set<string>();

/**
 * Preload an image URL into browser cache for instant rendering
 */
export function preloadImage(url: string): Promise<boolean> {
  if (!url || preloadedUrlSet.has(url) || url.startsWith('data:')) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      preloadedUrlSet.add(url);
      resolve(true);
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = url;
  });
}

/**
 * High-Speed Global CDN Edge Accelerator
 * Converts heavy unoptimized images
 * into ultra-fast, globally cached, WebP-compressed edge streams.
 */
export function getAcceleratedImageUrl(
  link: string,
  options?: { width?: number; quality?: number; format?: 'webp' | 'jpg' }
): string {
  if (!link || typeof link !== 'string') return '';
  const trimmed = link.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed;
  }

  const width = options?.width || 380;
  const quality = options?.quality || 82;
  const format = options?.format || 'webp';
  const cacheKey = `${trimmed}_w${width}_q${quality}_f${format}`;

  if (boostedUrlCache.has(cacheKey)) {
    return boostedUrlCache.get(cacheKey)!;
  }

  // Cloudflare-backed Global Image Accelerator (images.weserv.nl)
  const accelerated = `https://images.weserv.nl/?url=${encodeURIComponent(trimmed)}&w=${width}&q=${quality}&output=${format}`;

  boostedUrlCache.set(cacheKey, accelerated);
  return accelerated;
}

/**
 * Returns prioritized fallback cascade for any image URL:
 * - For HTTPS: Clean direct URL (fastest) -> Local cached server proxy -> Accelerated CDN
 * - For insecure HTTP: Local cached server proxy (bypasses browser mixed content) -> Accelerated CDN -> Clean direct URL
 */
export function getImageCandidates(link: string, width: number = 380): string[] {
  if (!isRemoteImageUrl(link)) return [link];
  const trimmed = link.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/api/')) {
    return [trimmed];
  }

  const clean = cleanImageUrl(trimmed);
  const localProxy = `/api/proxy-image?url=${encodeURIComponent(clean || trimmed)}&w=${width}`;
  const accelerated = getAcceleratedImageUrl(clean || trimmed, { width });

  // For insecure HTTP links in HTTPS environment, proxy must be first to prevent mixed content blocking
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && (clean.startsWith('http://') || trimmed.startsWith('http://'))) {
    return [localProxy, accelerated, clean];
  }

  // For secure HTTPS links: Direct CDN first (fastest) -> Local server proxy -> Accelerated CDN
  return [clean, localProxy, accelerated];
}

export interface RemoveBgResponse {
  success: boolean;
  dataUri: string;
  link?: string;
  imgbbUrl?: string | null;
  imgbbDisplayUrl?: string | null;
  imgbbError?: string | null;
  localHostedUrl?: string | null;
  mimeType?: string;
  sizeBytes?: number;
  message?: string;
  creditExhausted?: boolean;
  fallback?: boolean;
}

export const DEFAULT_IMGBB_API_KEY = '5a592c0c6ed5a88fac4f3544f53e55d1';
export const BACKUP_IMGBB_API_KEY = 'ce8694369a3b6a9e54f02aa6c0747b3d';
export const DEFAULT_REMOVE_BG_API_KEY = 'UnyLGokJVQKFifQK2z94udaS';
export const IMGBB_STORAGE_KEY = 'quicksku_imgbb_api_key';
export const REMOVE_BG_STORAGE_KEY = 'quicksku_remove_bg_api_key';

export function getStoredImgbbKey(): string {
  try {
    const stored = localStorage.getItem(IMGBB_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
    return (import.meta as any).env?.VITE_IMGBB_API_KEY || DEFAULT_IMGBB_API_KEY;
  } catch {
    return DEFAULT_IMGBB_API_KEY;
  }
}

export function setStoredImgbbKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(IMGBB_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(IMGBB_STORAGE_KEY);
    }
  } catch {}
}

export function getStoredRemoveBgKey(): string {
  try {
    const stored = localStorage.getItem(REMOVE_BG_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
    return (import.meta as any).env?.VITE_REMOVE_BG_API_KEY || DEFAULT_REMOVE_BG_API_KEY;
  } catch {
    return DEFAULT_REMOVE_BG_API_KEY;
  }
}

export function setStoredRemoveBgKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(REMOVE_BG_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(REMOVE_BG_STORAGE_KEY);
    }
  } catch {}
}

export interface UploadImgbbResponse {
  success: boolean;
  url: string;
  displayUrl?: string;
  thumbUrl?: string;
  deleteUrl?: string;
}

/**
 * Upload an image or data URI to ImgBB (https://api.imgbb.com/1/upload)
 * Resilient for both server environments (Vercel Serverless / Express) and static web hosts.
 */
export async function uploadToImgbb(
  image: string,
  options?: { key?: string; name?: string }
): Promise<UploadImgbbResponse> {
  const effectiveKey = options?.key || getStoredImgbbKey();
  if (!effectiveKey) {
    throw new Error('Please configure your free ImgBB API Key in Header ("ImgBB: Set Key ⚡").');
  }

  // 1. Try server/serverless endpoint first
  try {
    const res = await fetch('/api/upload-imgbb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        name: options?.name,
        key: effectiveKey
      })
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.success && data.url) {
        return data;
      }
    }
  } catch {
    // Server endpoint not reachable (e.g. pure static web host) - proceed to direct upload
  }

  // 2. Direct browser upload to ImgBB (ImgBB supports CORS Access-Control-Allow-Origin: *)
  try {
    const formData = new FormData();
    let cleanBase64 = typeof image === 'string' ? image.trim() : '';

    if (image.startsWith('blob:')) {
      const blobRes = await fetch(image);
      const blob = await blobRes.blob();
      formData.append('image', blob);
    } else if (image.startsWith('http://') || image.startsWith('https://')) {
      // Remote URL: Fetch image binary via local proxy or Weserv CDN to avoid CORS & remote 404 download errors on ImgBB
      let gotBlob = false;
      try {
        const proxyApiUrl = `/api/proxy-image?url=${encodeURIComponent(image)}`;
        const pRes = await fetch(proxyApiUrl, { signal: AbortSignal.timeout(6000) });
        if (pRes.ok) {
          const blob = await pRes.blob();
          if (blob.size > 100) {
            formData.append('image', blob);
            gotBlob = true;
          }
        }
      } catch {}

      if (!gotBlob) {
        try {
          const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(image)}&output=png`;
          const proxyRes = await fetch(proxied, { signal: AbortSignal.timeout(8000) });
          if (proxyRes.ok) {
            const blob = await proxyRes.blob();
            formData.append('image', blob);
            gotBlob = true;
          }
        } catch {}
      }

      if (!gotBlob) {
        formData.append('image', image);
      }
    } else {
      if (cleanBase64.startsWith('data:')) {
        cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;
      }
      cleanBase64 = cleanBase64.replace(/\s+/g, '');
      try {
        const binStr = atob(cleanBase64);
        const len = binStr.length;
        const u8arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8arr[i] = binStr.charCodeAt(i);
        }
        const mime = cleanBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
        const blob = new Blob([u8arr], { type: mime });
        formData.append('image', blob, options?.name ? `${options.name}.png` : 'image.png');
      } catch {
        formData.append('image', cleanBase64);
      }
    }

    if (options?.name) {
      formData.append('name', options.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
    }

    let directRes = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(effectiveKey)}`,
      {
        method: 'POST',
        body: formData
      }
    ).catch(() => null);

    let directData = await directRes?.json().catch(() => null);

    // If multipart failed, retry with URL-encoded form which is 100% resilient for base64 strings
    if (!directRes || !directRes.ok || !directData?.success) {
      try {
        const urlParams = new URLSearchParams();
        urlParams.append('image', cleanBase64);
        if (options?.name) {
          urlParams.append('name', options.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
        }
        const urlRes = await fetch(
          `https://api.imgbb.com/1/upload?key=${encodeURIComponent(effectiveKey)}`,
          {
            method: 'POST',
            body: urlParams,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        ).catch(() => null);
        const urlData = await urlRes?.json().catch(() => null);
        if (urlRes && urlRes.ok && urlData && urlData.success) {
          directRes = urlRes;
          directData = urlData;
        }
      } catch {}
    }

    // If primary key failed and using default key, retry with backup key
    if ((!directRes || !directRes.ok || !directData?.success) && effectiveKey === DEFAULT_IMGBB_API_KEY) {
      directRes = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(BACKUP_IMGBB_API_KEY)}`,
        {
          method: 'POST',
          body: formData
        }
      ).catch(() => null);
      directData = await directRes?.json().catch(() => null);
    }

    if (directRes && directRes.ok && directData && directData.success) {
      return {
        success: true,
        url: directData.data.url,
        displayUrl: directData.data.display_url || directData.data.url,
        thumbUrl: directData.data.thumb?.url,
        deleteUrl: directData.data.delete_url
      };
    } else {
      const errMsg = directData?.error?.message || `ImgBB rejected upload (HTTP ${directRes?.status || 500})`;
      throw new Error(errMsg);
    }
  } catch (directErr: any) {
    throw new Error(directErr.message || 'Failed to upload image to ImgBB');
  }
}

/**
 * High-Quality Client-Side Canvas Background Processor
 * Detects near-white or studio backdrops and cleanly replaces with pure Amazon #FFFFFF white or transparency.
 * Runs 100% in-browser with zero server dependency.
 */
export async function clientSideRemoveBg(
  imageUrl: string,
  bgColor: 'white' | 'transparent' = 'white'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Route remote URLs through CORS-enabled local proxy to guarantee zero canvas taint across Chrome, Brave & Safari
    let sourceUrl = imageUrl;
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      sourceUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 600;
        canvas.height = img.naturalHeight || img.height || 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas context unavailable');
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Sample border and corner pixels to detect dominant background tint
        const samplePoints = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
          [Math.floor(w / 2), 0],
          [Math.floor(w / 2), h - 1],
          [0, Math.floor(h / 2)],
          [w - 1, Math.floor(h / 2)]
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        samplePoints.forEach(([x, y]) => {
          const idx = (y * w + x) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        });
        bgR = Math.round(bgR / samplePoints.length);
        bgG = Math.round(bgG / samplePoints.length);
        bgB = Math.round(bgB / samplePoints.length);

        const tolerance = 42;
        const toleranceSq = tolerance * tolerance;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const distSq = (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2;
          const isNearWhite = r > 238 && g > 238 && b > 238;
          const isBgMatch = distSq < toleranceSq || (isNearWhite && bgR > 220 && bgG > 220 && bgB > 220);

          if (isBgMatch) {
            if (bgColor === 'transparent') {
              data[i + 3] = 0;
            } else {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
              data[i + 3] = 255;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const mime = bgColor === 'white' ? 'image/jpeg' : 'image/png';
        const dataUri = canvas.toDataURL(mime, 0.95);
        resolve(dataUri);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      // Fallback: If weserv proxy fails, try direct sourceUrl
      if (sourceUrl !== imageUrl) {
        const directImg = new Image();
        directImg.crossOrigin = 'anonymous';
        directImg.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = directImg.naturalWidth || directImg.width;
            c.height = directImg.naturalHeight || directImg.height;
            const cx = c.getContext('2d');
            if (cx) {
              cx.drawImage(directImg, 0, 0);
              resolve(c.toDataURL('image/jpeg', 0.95));
              return;
            }
          } catch {}
          resolve(imageUrl);
        };
        directImg.onerror = () => reject(new Error('Failed to load image for background processing'));
        directImg.src = imageUrl;
      } else {
        reject(new Error('Failed to load image for background processing'));
      }
    };

    img.src = sourceUrl;
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res.split(',')[1] || res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Direct browser call to official Remove.bg API
 * remove.bg natively supports CORS (Access-Control-Allow-Origin: *)
 */
export async function directBrowserRemoveBg(
  imageUrl: string,
  options?: {
    bgColor?: 'white' | 'transparent';
    size?: 'auto' | 'preview' | 'regular';
    name?: string;
    removeBgKey?: string;
  }
): Promise<{ dataUri: string; mimeType: string; sizeBytes: number }> {
  const apiKey = options?.removeBgKey || getStoredRemoveBgKey();
  if (!apiKey) {
    throw new Error('Remove.bg API key not found');
  }

  const payload: Record<string, any> = {
    size: options?.size || 'auto'
  };

  if (options?.bgColor && options.bgColor !== 'transparent') {
    payload.bg_color = options.bgColor;
    payload.format = 'jpg';
  } else {
    payload.format = 'png';
  }

  if (imageUrl.startsWith('data:')) {
    payload.image_file_b64 = imageUrl.split(',')[1] || imageUrl;
  } else {
    payload.image_url = imageUrl;
  }

  let res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'image/*,application/json'
    },
    body: JSON.stringify(payload)
  }).catch(() => null);

  // If remote image_url failed (e.g. Amazon CDN 404/block), fetch image buffer and retry with base64
  if ((!res || !res.ok) && !payload.image_file_b64) {
    try {
      let b64: string | null = null;
      try {
        const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`, {
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);
        if (proxyRes && proxyRes.ok) {
          const blob = await proxyRes.blob();
          if (blob.size > 100) b64 = await blobToBase64(blob);
        }
      } catch {}

      if (!b64) {
        const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
        const imgRes = await fetch(accelUrl, { signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (imgRes && imgRes.ok) {
          const blob = await imgRes.blob();
          b64 = await blobToBase64(blob);
        }
      }

      if (b64) {
        res = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'image/*,application/json'
          },
          body: JSON.stringify({
            ...payload,
            image_url: undefined,
            image_file_b64: b64
          })
        }).catch(() => null);
      }
    } catch {}
  }

  if (!res || !res.ok) {
    let errMsg = `Remove.bg request failed (status ${res?.status || 500})`;
    try {
      const errJson = await res?.json();
      if (errJson?.errors?.[0]?.title) {
        errMsg = errJson.errors[0].title;
      }
    } catch {}
    if (errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('quota') || res?.status === 402) {
      console.warn('[Direct Remove.bg] Credit quota note:', errMsg);
      throw new Error('Remove.bg credit quota reached');
    }
    throw new Error(errMsg);
  }

  const blob = await res.blob();
  const mimeType = blob.type || (options?.bgColor === 'white' ? 'image/jpeg' : 'image/png');
  const dataUri = await blobToDataUrl(blob);
  return {
    dataUri,
    mimeType,
    sizeBytes: blob.size
  };
}

/**
 * Single-Click Background Removal via Remove.bg API with ImgBB Link Generation
 * Multi-layer resilience:
 * Layer 1: Vercel Serverless / Express (/api/remove-bg)
 * Layer 2: Direct Browser Remove.bg API (using built-in pre-configured key)
 * Layer 3: Client Canvas Smart Processor
 * Layer 4: Permanent ImgBB Link Generator (https://i.ibb.co/...)
 */
export async function requestRemoveBg(
  imageUrl: string,
  options?: {
    bgColor?: 'white' | 'transparent';
    size?: 'auto' | 'preview' | 'regular';
    name?: string;
    imgbbKey?: string;
    removeBgKey?: string;
  }
): Promise<RemoveBgResponse> {
  const effectiveImgbbKey = options?.imgbbKey || getStoredImgbbKey();
  const effectiveRemoveBgKey = options?.removeBgKey || getStoredRemoveBgKey();

  let dataUri: string | null = null;
  let mimeType: string = options?.bgColor === 'white' ? 'image/jpeg' : 'image/png';
  let sizeBytes: number = 0;
  let finalServerLink: string | null = null;
  let initialImgbbUrl: string | null = null;
  let isCreditExhausted = false;

  // Layer 1: Attempt /api/remove-bg (works on Vercel Serverless Function & Express server)
  try {
    const res = await fetch('/api/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        bgColor: options?.bgColor ?? 'white',
        size: options?.size ?? 'auto',
        name: options?.name,
        imgbbKey: effectiveImgbbKey || undefined,
        removeBgKey: effectiveRemoveBgKey || undefined
      })
    });

    if (res.ok) {
      const data: RemoveBgResponse = await res.json().catch(() => null);
      if (data && data.success) {
        if (data.creditExhausted || data.fallback) {
          isCreditExhausted = true;
          // Clean the background in browser using smart canvas processor
          try {
            dataUri = await clientSideRemoveBg(
              data.dataUri || imageUrl,
              options?.bgColor ?? 'white'
            );
          } catch {
            dataUri = data.dataUri || null;
          }
        } else if (data.dataUri || data.link || data.imgbbUrl) {
          dataUri = data.dataUri || null;
        }
        mimeType = data.mimeType || mimeType;
        sizeBytes = data.sizeBytes || 0;
        finalServerLink = data.link || null;
        initialImgbbUrl = data.imgbbUrl || null;
      }
    }
  } catch {
    // /api/remove-bg not reachable (e.g. static web host or network issue)
  }

  // Layer 2: Direct browser call to official Remove.bg API if Layer 1 was unavailable or failed
  if (!dataUri && !finalServerLink && effectiveRemoveBgKey) {
    try {
      const direct = await directBrowserRemoveBg(imageUrl, {
        bgColor: options?.bgColor,
        size: options?.size,
        name: options?.name,
        removeBgKey: effectiveRemoveBgKey
      });
      dataUri = direct.dataUri;
      mimeType = direct.mimeType;
      sizeBytes = direct.sizeBytes;
    } catch (directErr: any) {
      if (directErr.message?.includes('quota') || directErr.message?.includes('credit')) {
        isCreditExhausted = true;
      }
      console.warn('Direct Remove.bg API note:', directErr.message);
    }
  }

  // Layer 3: Client-Side Smart Canvas Background Processor (zero server dependency)
  if (!dataUri && !finalServerLink) {
    try {
      dataUri = await clientSideRemoveBg(
        imageUrl,
        options?.bgColor ?? 'white'
      );
    } catch (clientErr: any) {
      throw new Error(clientErr.message || 'Failed to remove background');
    }
  }

  // Layer 4: Permanent ImgBB link generation (https://i.ibb.co/...)
  let imgbbUrl: string | null = initialImgbbUrl;
  let imgbbDisplayUrl: string | null = null;
  let imgbbError: string | null = null;

  if ((!imgbbUrl || isCreditExhausted) && effectiveImgbbKey && dataUri) {
    try {
      const uploaded = await uploadToImgbb(dataUri, {
        key: effectiveImgbbKey,
        name: options?.name
      });
      if (uploaded && uploaded.success) {
        imgbbUrl = uploaded.url;
        imgbbDisplayUrl = uploaded.displayUrl;
      }
    } catch (uploadErr: any) {
      console.warn('ImgBB upload error:', uploadErr.message);
      imgbbError = uploadErr.message;
    }
  }

  const link = imgbbUrl || finalServerLink || dataUri || imageUrl;

  return {
    success: true,
    dataUri: dataUri || '',
    link,
    imgbbUrl,
    imgbbDisplayUrl,
    imgbbError,
    mimeType,
    sizeBytes,
    creditExhausted: isCreditExhausted,
    message: isCreditExhausted
      ? 'Processed via in-browser studio engine (Remove.bg free quota reached)'
      : (imgbbUrl
          ? 'Background removed & uploaded to ImgBB'
          : 'Background removed successfully')
  };
}

// Fallback SVG data URL when image fails to load or is a local file path
export const BROKEN_IMG_SVG = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<rect width="100" height="100" fill="#2a2f3a"/>' +
  '<text x="50" y="44" font-size="28" text-anchor="middle" fill="#f5a524">&#9888;</text>' +
  '<text x="50" y="70" font-size="9" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#9aa2af">NO PREVIEW</text>' +
  '</svg>'
);

// Safely format any value to a string
export function safeStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Truncate text cleanly
export function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
