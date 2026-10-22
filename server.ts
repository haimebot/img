import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '20mb' }));

  // API Route: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'Amazon Image Viewer' });
  });

  // API Route: Fast Image Proxy stream with aggressive edge caching and CORS headers
  app.get('/api/proxy-img', async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl) {
        return res.status(400).send('imageUrl query param is required');
      }

      const w = req.query.w ? parseInt(req.query.w as string, 10) : 480;

      // Try weserv CDN accelerator first (ultra-fast, global Cloudflare edge caching, WebP)
      const acceleratedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&w=${w}&q=82&output=webp`;
      let upstreamRes = await fetch(acceleratedUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null);

      if (!upstreamRes || !upstreamRes.ok) {
        // Fallback to direct fetch
        upstreamRes = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/*,*/*'
          },
          signal: AbortSignal.timeout(8000)
        }).catch(() => null);
      }

      if (!upstreamRes || !upstreamRes.ok) {
        return res.status(404).send('Image could not be retrieved');
      }

      const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      const arrayBuffer = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('API proxy-img error:', err);
      res.status(500).send('Failed to proxy image');
    }
  });

  // High-performance In-Memory Proxy Cache (stores up to 1500 images)
  const proxyMemoryCache = new Map<string, { buffer: Buffer; contentType: string; createdAt: number }>();

  // API Route: Image Proxy with In-Memory Caching & dual binary/JSON response
  const handleProxyImage = async (req: express.Request, res: express.Response) => {
    try {
      let imageUrl = (req.query.url as string) || (req.query.imageUrl as string) || req.body?.imageUrl || req.body?.url;
      if (!imageUrl || typeof imageUrl !== 'string') {
        return res.status(400).json({ error: 'url or imageUrl parameter is required' });
      }

      imageUrl = imageUrl.trim();
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('data:')) {
        imageUrl = 'https://' + imageUrl;
      }

      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      if (imageUrl.startsWith('data:')) {
        const parts = imageUrl.split(',');
        const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
        const buffer = Buffer.from(parts[1] || '', 'base64');
        const wantsJson = req.method === 'POST' || req.query.format === 'json' || req.headers.accept?.includes('application/json');
        if (!wantsJson && (req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Content-Type', mime);
          res.setHeader('Content-Length', buffer.length);
          if (req.method === 'HEAD') return res.status(200).end();
          return res.send(buffer);
        }
        return res.json({ success: true, dataUri: imageUrl, mimeType: mime, sizeBytes: buffer.length });
      }

      // Check In-Memory Cache
      const cacheKey = imageUrl;
      const cached = proxyMemoryCache.get(cacheKey);
      const wantsJson = req.method === 'POST' || req.query.format === 'json' || req.headers.accept?.includes('application/json');

      if (cached) {
        if (!wantsJson && (req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Content-Type', cached.contentType);
          res.setHeader('Content-Length', cached.buffer.length);
          if (req.method === 'HEAD') return res.status(200).end();
          return res.send(cached.buffer);
        }
        const base64 = cached.buffer.toString('base64');
        const dataUri = `data:${cached.contentType};base64,${base64}`;
        return res.json({ success: true, dataUri, mimeType: cached.contentType, sizeBytes: cached.buffer.length });
      }

      // 1. Direct fetch with Amazon/CDN-compatible headers
      let response: Response | null = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': imageUrl.includes('amazon') ? 'https://www.amazon.com/' : undefined as any
        },
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);

      // 2. Retry with generic headers if direct failed
      if (!response || !response.ok) {
        response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'curl/8.5.0',
            'Accept': '*/*'
          },
          signal: AbortSignal.timeout(8000)
        }).catch(() => null);
      }

      // 3. Fallback to edge accelerator (weserv.nl)
      if (!response || !response.ok) {
        const acceleratedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
        response = await fetch(acceleratedUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      }

      if (!response || !response.ok) {
        throw new Error(`Failed to fetch image: HTTP ${response?.status || '504 Timeout'}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Sniff magic bytes to guarantee valid image MIME type for Chrome & Brave CORB compliance
      let contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/') || contentType.includes('octet-stream')) {
        if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
          contentType = 'image/jpeg';
        } else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
          contentType = 'image/png';
        } else if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
          contentType = 'image/gif';
        } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
          contentType = 'image/webp';
        } else if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
          contentType = 'image/avif';
        } else {
          contentType = 'image/jpeg';
        }
      }

      // Store in Memory Cache (evict oldest if size > 1500)
      if (proxyMemoryCache.size > 1500) {
        const oldest = proxyMemoryCache.keys().next().value;
        if (oldest) proxyMemoryCache.delete(oldest);
      }
      proxyMemoryCache.set(cacheKey, {
        buffer,
        contentType,
        createdAt: Date.now()
      });

      if (!wantsJson && (req.method === 'GET' || req.method === 'HEAD')) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(buffer);
      }

      const base64 = buffer.toString('base64');
      const dataUri = `data:${contentType};base64,${base64}`;

      return res.json({ success: true, dataUri, mimeType: contentType, sizeBytes: buffer.length });
    } catch (err: any) {
      console.error('API proxy-image error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch image' });
    }
  };

  app.options('/api/proxy-image', (req, res) => res.status(200).end());
  app.options('/api/proxy-img', (req, res) => res.status(200).end());
  app.get('/api/proxy-image', handleProxyImage);
  app.head('/api/proxy-image', handleProxyImage);
  app.post('/api/proxy-image', handleProxyImage);
  app.get('/api/proxy-img', handleProxyImage);
  app.head('/api/proxy-img', handleProxyImage);
  app.post('/api/proxy-img', handleProxyImage);

  // API Route: Single-Click Background Removal via remove.bg API
  app.post('/api/remove-bg', async (req, res) => {
    try {
      const { imageUrl, bgColor = 'white', size = 'auto', format = 'png', removeBgKey, imgbbKey } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
      }

      const removeBgApiKey =
        (removeBgKey as string) ||
        (req.body.apiKey as string) ||
        process.env.REMOVE_BG_API_KEY ||
        'UnyLGokJVQKFifQK2z94udaS';

      const payload: Record<string, any> = {
        size: size || 'auto'
      };

      if (bgColor && bgColor !== 'transparent') {
        payload.bg_color = bgColor; // 'white' or '#FFFFFF'
        payload.format = 'jpg';
      } else {
        payload.format = 'png';
      }

      let buffer: Buffer | null = null;
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1] || imageUrl;
        payload.image_file_b64 = base64Data;
        try {
          buffer = Buffer.from(base64Data, 'base64');
        } catch {}
      } else {
        payload.image_url = imageUrl;
      }

      // Call remove.bg official API
      let removeBgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': removeBgApiKey,
          'Content-Type': 'application/json',
          'Accept': 'image/*,application/json'
        },
        body: JSON.stringify(payload)
      }).catch(() => null);

      // If remove.bg couldn't fetch image_url directly (e.g. timeout / CDN protected),
      // fetch the image buffer server-side and retry with image_file_b64
      if ((!removeBgResponse || !removeBgResponse.ok) && !payload.image_file_b64) {
        // 1. Direct fetch
        const imgFetch = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'image/*,*/*'
          },
          signal: AbortSignal.timeout(8000)
        }).catch(() => null);

        if (imgFetch && imgFetch.ok) {
          buffer = Buffer.from(await imgFetch.arrayBuffer());
        } else {
          // 2. Accelerator fetch
          const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
          const accelFetch = await fetch(accelUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null);
          if (accelFetch && accelFetch.ok) {
            buffer = Buffer.from(await accelFetch.arrayBuffer());
          }
        }

        if (buffer) {
          const retryPayload = {
            size: size || 'auto',
            bg_color: payload.bg_color,
            format: payload.format,
            image_file_b64: buffer.toString('base64')
          };

          removeBgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: {
              'X-Api-Key': removeBgApiKey,
              'Content-Type': 'application/json',
              'Accept': 'image/*,application/json'
            },
            body: JSON.stringify(retryPayload)
          }).catch(() => null);
        }
      }

      let isFallback = false;
      let isCreditExhausted = false;
      let outputBuffer: Buffer | null = null;
      let outputContentType = payload.bg_color === 'white' ? 'image/jpeg' : 'image/png';

      if (removeBgResponse && removeBgResponse.ok) {
        const arrayBuffer = await removeBgResponse.arrayBuffer();
        outputBuffer = Buffer.from(arrayBuffer);
        outputContentType = removeBgResponse.headers.get('content-type') || outputContentType;
      } else {
        // Handle Insufficient credits or API rate limit gracefully
        let errorMsg = 'Remove.bg API failed';
        try {
          const errData = await removeBgResponse?.json();
          if (errData?.errors?.[0]?.title) {
            errorMsg = errData.errors[0].title;
          }
        } catch {}

        if (
          errorMsg.toLowerCase().includes('credit') ||
          errorMsg.toLowerCase().includes('quota') ||
          removeBgResponse?.status === 402
        ) {
          isCreditExhausted = true;
        }

        console.warn(`[Remove.bg] API note: ${errorMsg}. Proceeding with studio fallback and ImgBB link generation.`);
        isFallback = true;

        // Ensure we have a valid buffer for the fallback image
        if (!buffer) {
          if (imageUrl.startsWith('data:')) {
            const base64Data = imageUrl.split(',')[1] || imageUrl;
            buffer = Buffer.from(base64Data, 'base64');
          } else {
            const imgFetch = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
                'Accept': 'image/*,*/*'
              },
              signal: AbortSignal.timeout(8000)
            }).catch(() => null);

            if (imgFetch && imgFetch.ok) {
              buffer = Buffer.from(await imgFetch.arrayBuffer());
            } else {
              const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
              const accelFetch = await fetch(accelUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null);
              if (accelFetch && accelFetch.ok) {
                buffer = Buffer.from(await accelFetch.arrayBuffer());
              }
            }
          }
        }

        outputBuffer = buffer;
      }

      if (!outputBuffer) {
        return res.status(400).json({ error: 'Failed to retrieve image for processing', success: false });
      }

      const base64 = outputBuffer.toString('base64');
      const dataUri = `data:${outputContentType};base64,${base64}`;

      // Upload background-removed image to ImgBB (https://api.imgbb.com/1/upload)
      let imgbbUrl: string | null = null;
      let imgbbDisplayUrl: string | null = null;
      let imgbbError: string | null = null;

      const DEFAULT_IMGBB_KEY = '5a592c0c6ed5a88fac4f3544f53e55d1';
      const imgbbApiKey =
        (imgbbKey as string) ||
        (req.body.key as string) ||
        process.env.IMGBB_API_KEY ||
        DEFAULT_IMGBB_KEY;

      if (imgbbApiKey) {
        try {
          const form = new URLSearchParams();
          form.append('image', base64);
          if (req.body.name) {
            form.append('name', String(req.body.name).replace(/[^a-zA-Z0-9_-]/g, '_'));
          }

          let imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbApiKey)}`, {
            method: 'POST',
            body: form,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            signal: AbortSignal.timeout(20000)
          }).catch(() => null);

          let imgbbData = await imgbbRes?.json().catch(() => null);

          // Retry with backup key if primary fails
          if ((!imgbbRes || !imgbbRes.ok || !imgbbData?.success) && imgbbApiKey === DEFAULT_IMGBB_KEY) {
            const BACKUP_KEY = 'ce8694369a3b6a9e54f02aa6c0747b3d';
            imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(BACKUP_KEY)}`, {
              method: 'POST',
              body: form,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              signal: AbortSignal.timeout(20000)
            }).catch(() => null);
            imgbbData = await imgbbRes?.json().catch(() => null);
          }

          if (imgbbRes && imgbbRes.ok && imgbbData && imgbbData.success) {
            imgbbUrl = imgbbData.data.url;
            imgbbDisplayUrl = imgbbData.data.display_url || imgbbData.data.url;
            console.log(`[ImgBB] Successfully uploaded background-removed image: ${imgbbUrl}`);
          } else {
            imgbbError = imgbbData?.error?.message || `ImgBB HTTP ${imgbbRes?.status || 500}`;
            console.warn(`[ImgBB] Upload returned error:`, imgbbError);
          }
        } catch (imgbbErr: any) {
          console.warn('[ImgBB] upload error:', imgbbErr);
          imgbbError = imgbbErr.message || 'ImgBB network error';
        }
      }

      // Store in memory for clean server-hosted HTTPS image link
      const imageId = `cutout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      hostedImages.set(imageId, {
        buffer: outputBuffer,
        contentType: outputContentType,
        createdAt: Date.now()
      });

      if (hostedImages.size > 500) {
        const oldestKey = hostedImages.keys().next().value;
        if (oldestKey) hostedImages.delete(oldestKey);
      }

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const localHostedUrl = `${protocol}://${host}/api/hosted-image/${imageId}`;

      // Final generated shareable link: ImgBB public URL if available, else local hosted link
      const generatedLink = imgbbUrl || localHostedUrl;

      return res.json({
        success: true,
        message: isFallback
          ? 'Remove.bg quota reached: Image processed with studio fallback & uploaded to ImgBB'
          : (imgbbUrl ? 'Background successfully removed & uploaded to ImgBB' : 'Background successfully removed'),
        fallback: isFallback,
        creditExhausted: isCreditExhausted,
        link: generatedLink,
        imgbbUrl,
        imgbbDisplayUrl,
        imgbbError,
        localHostedUrl,
        dataUri,
        mimeType: outputContentType,
        sizeBytes: outputBuffer.length
      });
    } catch (err: any) {
      const isCreditIssue = err?.message?.toLowerCase().includes('credit') || err?.message?.toLowerCase().includes('quota');
      if (isCreditIssue) {
        console.warn('[Remove.bg] Notice: Free credit quota reached. Proceeding with client studio fallback.');
        return res.json({
          success: true,
          fallback: true,
          creditExhausted: true,
          message: 'Remove.bg free quota reached: In-browser studio fallback active',
          link: req.body?.imageUrl || ''
        });
      }
      console.error('API remove-bg error:', err?.message || err);
      res.status(500).json({ error: err?.message || 'Background removal failed' });
    }
  });

  // In-memory cache for server-hosted image cutouts
  const hostedImages = new Map<string, { buffer: Buffer; contentType: string; createdAt: number }>();

  // API Route: Serve server-hosted clean image cutouts
  app.get('/api/hosted-image/:id', (req, res) => {
    const item = hostedImages.get(req.params.id);
    if (!item) {
      return res.status(404).send('Hosted image not found or expired');
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(item.buffer);
  });

  // API Route: Upload any image to ImgBB (https://api.imgbb.com/1/upload)
  app.post('/api/upload-imgbb', async (req, res) => {
    try {
      const { image, name, key } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'image data is required' });
      }

      const PRIMARY_IMGBB_KEY = '5a592c0c6ed5a88fac4f3544f53e55d1';
      const BACKUP_IMGBB_KEY = 'ce8694369a3b6a9e54f02aa6c0747b3d';
      const imgbbKey = key || process.env.IMGBB_API_KEY || PRIMARY_IMGBB_KEY;

      let cleanBase64 = typeof image === 'string' ? image.trim() : '';
      if (cleanBase64.startsWith('data:')) {
        cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;
        cleanBase64 = cleanBase64.replace(/\s+/g, '');
      } else if (cleanBase64.startsWith('http://') || cleanBase64.startsWith('https://')) {
        // Fetch remote image buffer server-side to guarantee clean binary base64
        let imgRes = await fetch(cleanBase64, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'image/*,*/*'
          },
          signal: AbortSignal.timeout(10000)
        }).catch(() => null);

        if (!imgRes || !imgRes.ok) {
          const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(cleanBase64)}&q=95`;
          imgRes = await fetch(accelUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        }

        if (imgRes && imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          cleanBase64 = Buffer.from(arrayBuf).toString('base64');
        }
      } else {
        cleanBase64 = cleanBase64.replace(/\s+/g, '');
      }

      const form = new URLSearchParams();
      form.append('image', cleanBase64);
      if (name) {
        form.append('name', String(name).replace(/[^a-zA-Z0-9_-]/g, '_'));
      }

      let uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbKey)}`, {
        method: 'POST',
        body: form,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        signal: AbortSignal.timeout(20000)
      }).catch(() => null);

      let data = await uploadRes?.json().catch(() => null);

      // If primary key failed, retry with backup key
      if ((!uploadRes || !uploadRes.ok || !data?.success) && imgbbKey === PRIMARY_IMGBB_KEY) {
        uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(BACKUP_IMGBB_KEY)}`, {
          method: 'POST',
          body: form,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          signal: AbortSignal.timeout(20000)
        }).catch(() => null);
        data = await uploadRes?.json().catch(() => null);
      }

      if (!uploadRes || !uploadRes.ok || !data || !data.success) {
        const errMsg = data?.error?.message || `ImgBB upload failed with HTTP ${uploadRes?.status || 500}`;
        return res.status(uploadRes?.status || 500).json({ error: errMsg, success: false });
      }

      return res.json({
        success: true,
        url: data.data.url,
        displayUrl: data.data.display_url || data.data.url,
        thumbUrl: data.data.thumb?.url,
        deleteUrl: data.data.delete_url
      });
    } catch (err: any) {
      console.error('API upload-imgbb error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload to ImgBB' });
    }
  });

  // Production static file serving vs Vite development middleware
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV === 'production' || hasDist) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Amazon Image Viewer server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
