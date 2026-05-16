// ═══════════════════════════════════════
// PHOTO PROCESSING WEB WORKER
// Extracts EXIF data and generates thumbnails from JPEG files.
// Runs in an isolated worker context — no access to main page globals.
// ═══════════════════════════════════════

// Lightweight EXIF parser — extracts GPS, DateTimeOriginal, and camera info
function parseExifFromBuffer(buf) {
  const view = new DataView(buf);
  let result = { lat: null, lng: null, date: null, time: null };
  if (view.getUint16(0) !== 0xFFD8) return result; // not JPEG
  let offset = 2;
  while (offset < view.byteLength - 1) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) { // APP1 (EXIF)
      const length = view.getUint16(offset + 2);
      const exifStart = offset + 4;
      // Check "Exif\0\0"
      if (view.getUint32(exifStart) === 0x45786966 && view.getUint16(exifStart + 4) === 0x0000) {
        result = readExifData(view, exifStart + 6, exifStart + 6 + length - 6);
      }
      break;
    }
    if ((marker & 0xFF00) !== 0xFF00) break;
    offset += 2 + view.getUint16(offset + 2);
  }
  return result;
}

function readExifData(view, tiffStart, end) {
  const le = view.getUint16(tiffStart) === 0x4949; // little-endian?
  const g16 = (o) => view.getUint16(o, le);
  const g32 = (o) => view.getUint32(o, le);
  const result = { lat: null, lng: null, date: null, time: null, camera: null };

  function readIFD(ifdOffset) {
    if (ifdOffset + 2 > end) return {};
    const count = g16(ifdOffset);
    const tags = {};
    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      if (entry + 12 > end) break;
      const tag = g16(entry);
      const type = g16(entry + 2);
      const num = g32(entry + 4);
      const valOff = entry + 8;
      tags[tag] = { type, num, valOff };
    }
    return tags;
  }

  function getRational(off) {
    return g32(tiffStart + off) / g32(tiffStart + off + 4);
  }

  function getString(tag) {
    if (!tag) return null;
    if (tag.num <= 4) {
      let s = '';
      for (let i = 0; i < tag.num; i++) { const c = view.getUint8(tag.valOff + i); if (c) s += String.fromCharCode(c); }
      return s;
    }
    const off = tiffStart + g32(tag.valOff);
    let s = '';
    for (let i = 0; i < Math.min(tag.num, 100); i++) { const c = view.getUint8(off + i); if (c) s += String.fromCharCode(c); }
    return s;
  }

  function getGpsCoord(tag) {
    if (!tag || tag.num < 3) return null;
    const off = g32(tag.valOff);
    const d = getRational(off);
    const m = getRational(off + 8);
    const s = getRational(off + 16);
    return d + m / 60 + s / 3600;
  }

  function getGpsRef(tag) {
    if (!tag) return '';
    return String.fromCharCode(view.getUint8(tag.valOff));
  }

  // Read IFD0
  const ifd0Off = g32(tiffStart + 4);
  const ifd0 = readIFD(tiffStart + ifd0Off);

  // Camera make (0x010F) and model (0x0110)
  const make = getString(ifd0[0x010F]);
  const model = getString(ifd0[0x0110]);
  if (model) {
    const m2 = model.trim();
    const mk = make ? make.trim() : '';
    // If model already starts with make (e.g. "Apple iPhone 15 Pro"), use model as-is
    result.camera = (mk && m2.toLowerCase().indexOf(mk.toLowerCase()) === 0) ? m2 : (mk ? mk + ' ' + m2 : m2);
  }

  // DateTimeOriginal is in ExifIFD
  if (ifd0[0x8769]) { // ExifIFD pointer
    const exifOff = g32(ifd0[0x8769].valOff);
    const exifIfd = readIFD(tiffStart + exifOff);
    const dtTag = exifIfd[0x9003] || exifIfd[0x9004] || ifd0[0x0132]; // DateTimeOriginal, DateTimeDigitized, DateTime
    if (dtTag) {
      const dt = getString(dtTag);
      if (dt) {
        const m = dt.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
        if (m) { result.date = m[1]+'-'+m[2]+'-'+m[3]; result.time = m[4]+':'+m[5]; }
      }
    }
  }

  // DateTime fallback from IFD0
  if (!result.date && ifd0[0x0132]) {
    const dt = getString(ifd0[0x0132]);
    if (dt) {
      const m = dt.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
      if (m) { result.date = m[1]+'-'+m[2]+'-'+m[3]; result.time = m[4]+':'+m[5]; }
    }
  }

  // GPS IFD
  if (ifd0[0x8825]) {
    const gpsOff = g32(ifd0[0x8825].valOff);
    const gps = readIFD(tiffStart + gpsOff);
    const lat = getGpsCoord(gps[0x0002]);
    const lng = getGpsCoord(gps[0x0004]);
    const latRef = getGpsRef(gps[0x0001]);
    const lngRef = getGpsRef(gps[0x0003]);
    if (lat !== null && lng !== null) {
      result.lat = (latRef === 'S') ? -lat : lat;
      result.lng = (lngRef === 'W') ? -lng : lng;
    }
  }

  return result;
}

// Thumbnail generation via OffscreenCanvas
async function makeThumbnail(blob, maxDim) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(maxDim / bmp.width, maxDim / bmp.height, 1);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return outBlob;
}

// Convert blob to data URL
function blobToDataURL(blob) {
  return new Promise(r => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
}

// Message handler
self.onmessage = async (e) => {
  const { id, file, arrayBuffer } = e.data;
  try {
    const exif = parseExifFromBuffer(arrayBuffer);
    const blob = new Blob([arrayBuffer], { type: file.type });
    const [dataUrl, thumbBlob] = await Promise.all([
      blobToDataURL(blob),
      makeThumbnail(blob, 200)
    ]);
    const thumbUrl = await blobToDataURL(thumbBlob);
    self.postMessage({ id, ok: true, exif, dataUrl, thumbUrl });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
