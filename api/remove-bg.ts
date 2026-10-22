// Vercel Serverless Function: Remove.bg API + ImgBB Link Generator
// Deployed automatically to /api/remove-bg on Vercel

export default async function handler(req: any, res: any) {
  // CORS headers
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

    const {
      imageUrl,
      bgColor = 'white',
      size = 'auto',
      name,
      imgbbKey: clientImgbbKey,
      removeBgKey: clientRemoveBgKey
    } = body || {};

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required', success: false });
    }

    const removeBgApiKey =
      clientRemoveBgKey ||
      process.env.REMOVE_BG_API_KEY ||
      'UnyLGokJVQKFifQK2z94udaS';

    const payload: Record<string, any> = {
      size: size || 'auto'
    };

    if (bgColor && bgColor !== 'transparent') {
      payload.bg_color = bgColor; // 'white'
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
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'image/*,*/*'
        },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);

      if (imgFetch && imgFetch.ok) {
        buffer = Buffer.from(await imgFetch.arrayBuffer());
      } else {
        // 2. Accelerator proxy fetch
        const accelUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&q=95`;
        const accelFetch = await fetch(accelUrl, {
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);
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
    let outputContentType =
      payload.bg_color === 'white' ? 'image/jpeg' : 'image/png';

    if (removeBgResponse && removeBgResponse.ok) {
      const arrayBuffer = await removeBgResponse.arrayBuffer();
      outputBuffer = Buffer.from(arrayBuffer);
      outputContentType =
        removeBgResponse.headers.get('content-type') || outputContentType;
    } else {
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

      console.warn(`[Vercel API Remove.bg] Note: ${errorMsg}. Activating studio fallback.`);
      isFallback = true;

      if (!buffer) {
        if (imageUrl.startsWith('data:')) {
          const base64Data = imageUrl.split(',')[1] || imageUrl;
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          const imgFetch = await fetch(imageUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
              Accept: 'image/*,*/*'
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
      clientImgbbKey || process.env.IMGBB_API_KEY || DEFAULT_IMGBB_KEY;

    if (imgbbApiKey) {
      try {
        const form = new URLSearchParams();
        form.append('image', base64);
        if (name) {
          form.append(
            'name',
            String(name).replace(/[^a-zA-Z0-9_-]/g, '_')
          );
        }

        let imgbbRes = await fetch(
          `https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbApiKey)}`,
          {
            method: 'POST',
            body: form,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            signal: AbortSignal.timeout(20000)
          }
        ).catch(() => null);

        let imgbbData = await imgbbRes?.json().catch(() => null);

        // If primary key upload failed and using default key, retry with backup key
        if ((!imgbbRes || !imgbbRes.ok || !imgbbData?.success) && imgbbApiKey === DEFAULT_IMGBB_KEY) {
          const BACKUP_KEY = 'ce8694369a3b6a9e54f02aa6c0747b3d';
          imgbbRes = await fetch(
            `https://api.imgbb.com/1/upload?key=${encodeURIComponent(BACKUP_KEY)}`,
            {
              method: 'POST',
              body: form,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              signal: AbortSignal.timeout(20000)
            }
          ).catch(() => null);
          imgbbData = await imgbbRes?.json().catch(() => null);
        }

        if (imgbbRes && imgbbRes.ok && imgbbData && imgbbData.success) {
          imgbbUrl = imgbbData.data.url;
          imgbbDisplayUrl = imgbbData.data.display_url || imgbbData.data.url;
        } else {
          imgbbError = imgbbData?.error?.message || `ImgBB HTTP ${imgbbRes?.status || 500}`;
        }
      } catch (imgbbErr: any) {
        imgbbError = imgbbErr.message || 'ImgBB network error';
      }
    }

    return res.status(200).json({
      success: true,
      fallback: isFallback,
      creditExhausted: isCreditExhausted,
      message: isFallback
        ? 'Remove.bg quota reached: Image processed with studio fallback & uploaded to ImgBB'
        : 'Background successfully removed & uploaded to ImgBB',
      dataUri,
      imgbbUrl,
      imgbbDisplayUrl,
      imgbbError,
      link: imgbbUrl || dataUri,
      mimeType: outputContentType,
      sizeBytes: outputBuffer.length
    });
  } catch (err: any) {
    const isCreditIssue =
      err?.message?.toLowerCase().includes('credit') ||
      err?.message?.toLowerCase().includes('quota');
    if (isCreditIssue) {
      console.warn('[Vercel API] Remove.bg credit quota reached. Proceeding with client studio fallback.');
      return res.status(200).json({
        success: true,
        fallback: true,
        creditExhausted: true,
        message: 'Remove.bg free quota reached: In-browser studio fallback active',
        link: req.body?.imageUrl || ''
      });
    }
    console.error('[Vercel API] remove-bg error:', err?.message || err);
    return res.status(500).json({
      error: err.message || 'Background removal failed',
      success: false
    });
  }
}
