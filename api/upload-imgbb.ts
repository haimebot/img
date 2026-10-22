// Vercel Serverless Function: ImgBB Image Uploader
// Deployed automatically to /api/upload-imgbb on Vercel

export default async function handler(req: any, res: any) {
  // Set CORS headers for web deployment
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { image, name, key } = body || {};
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
      // Remote URL: Download buffer server-side so ImgBB receives binary base64
      // and is never blocked by remote CDN / 404 download errors
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
        imgRes = await fetch(accelUrl, {
          signal: AbortSignal.timeout(8000)
        }).catch(() => null);
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

    return res.status(200).json({
      success: true,
      url: data.data.url,
      displayUrl: data.data.display_url || data.data.url,
      thumbUrl: data.data.thumb?.url,
      deleteUrl: data.data.delete_url
    });
  } catch (err: any) {
    console.error('[Vercel API] upload-imgbb error:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload to ImgBB', success: false });
  }
}
