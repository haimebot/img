// Vercel Serverless Function: Image Proxy
// Deployed to /api/proxy-image on Vercel

function detectMimeTypeFromBuffer(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp' && buf.toString('ascii', 8, 12) === 'avif') return 'image/avif';
  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let imageUrl =
    (req.query.url as string) ||
    (req.query.imageUrl as string) ||
    req.body?.imageUrl ||
    req.body?.url;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'url or imageUrl parameter is required' });
  }

  imageUrl = imageUrl.trim();
  if (imageUrl.startsWith('//')) {
    imageUrl = 'https:' + imageUrl;
  } else if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith('data:')) {
    imageUrl = 'https://' + imageUrl;
  }

  // Edge Caching Headers for maximum speed & CDN acceleration
  res.setHeader(
    'Cache-Control',
    'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (imageUrl.startsWith('data:')) {
    const parts = imageUrl.split(',');
    const mimeMatch = parts[0]?.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = parts[1] || '';
    const buf = Buffer.from(base64Data, 'base64');

    const wantsJson = req.method === 'POST' || req.query.format === 'json' || req.headers.accept?.includes('application/json');
    if (!wantsJson && (req.method === 'GET' || req.method === 'HEAD')) {
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buf.length);
      if (req.method === 'HEAD') return res.status(200).end();
      return res.send(buf);
    }
    return res.status(200).json({ success: true, dataUri: imageUrl, mimeType, sizeBytes: buf.length });
  }

  try {
    let imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: imageUrl.includes('amazon') ? 'https://www.amazon.com/' : undefined as any
      },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null);

    if (!imgRes || !imgRes.ok) {
      const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
      imgRes = await fetch(accelUrl, {
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);
    }

    if (!imgRes || !imgRes.ok) {
      return res.status(502).json({ error: 'Could not fetch remote image' });
    }

    const rawContentType = imgRes.headers.get('content-type') || '';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Magic-byte sniffing to guarantee correct MIME type (prevents Chrome/Brave CORB)
    const detectedMime = detectMimeTypeFromBuffer(buffer);
    const finalContentType = detectedMime || (rawContentType && rawContentType.startsWith('image/') ? rawContentType : 'image/jpeg');

    // Dual response: Return binary image directly for GET unless json requested
    const wantsJson = req.method === 'POST' || req.query.format === 'json' || req.headers.accept?.includes('application/json');
    if (!wantsJson && (req.method === 'GET' || req.method === 'HEAD')) {
      res.setHeader('Content-Type', finalContentType);
      res.setHeader('Content-Length', buffer.length);
      if (req.method === 'HEAD') return res.status(200).end();
      return res.send(buffer);
    }

    const dataUri = `data:${finalContentType};base64,${buffer.toString('base64')}`;
    return res.status(200).json({ success: true, dataUri, mimeType: finalContentType, sizeBytes: buffer.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Image proxy error' });
  }
}

