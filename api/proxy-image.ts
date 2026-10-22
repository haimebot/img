// Vercel Serverless Function: Image Proxy
// Deployed to /api/proxy-image on Vercel

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const imageUrl =
    (req.query.url as string) ||
    (req.query.imageUrl as string) ||
    req.body?.imageUrl ||
    req.body?.url;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'url or imageUrl parameter is required' });
  }

  // Edge Caching Headers for maximum speed & CDN acceleration
  res.setHeader(
    'Cache-Control',
    'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  try {
    let imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
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

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Dual response: Return binary image directly for GET unless json requested
    const wantsJson = req.method === 'POST' || req.query.format === 'json' || req.headers.accept?.includes('application/json');
    if (!wantsJson && req.method === 'GET') {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;
    return res.status(200).json({ success: true, dataUri, mimeType: contentType, sizeBytes: buffer.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Image proxy error' });
  }
}
