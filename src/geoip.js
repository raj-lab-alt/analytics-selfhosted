const http = require('http');

const cache = new Map();
const CACHE_TTL = 86400000;

async function lookup(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return { city: '', country: '', lat: 0, lon: 0 };

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const data = await new Promise((resolve, reject) => {
      const req = http.get(`http://ip-api.com/json/${ip}?fields=city,countryCode,lat,lon`, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
      });
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
    });

    const result = {
      city: data.city || '',
      country: data.countryCode || '',
      lat: data.lat || 0,
      lon: data.lon || 0,
    };

    cache.set(ip, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    return { city: '', country: '', lat: 0, lon: 0 };
  }
}

module.exports = { lookup };
