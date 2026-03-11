/* Škáluje favicon-32x32.png na PWA ikony */
const zlib = require('zlib');
const fs   = require('fs');

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i=0; i<256; i++) {
    let c=i;
    for (let j=0; j<8; j++) c = (c&1) ? (0xEDB88320^(c>>>1)) : (c>>>1);
    t[i]=c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i=0; i<buf.length; i++) c = (c>>>8) ^ CRC_TABLE[(c^buf[i])&0xFF];
  return (c^0xFFFFFFFF)>>>0;
}

function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  data.copy(b, 8);
  b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type,'ascii'), data])), 8+data.length);
  return b;
}

function writePNG(pixels, size, file) {
  const sig  = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6; // RGBA

  const raw = Buffer.alloc(size*(size*4+1));
  for (let y=0; y<size; y++) {
    raw[y*(size*4+1)] = 0;
    for (let x=0; x<size; x++) {
      const si=(y*size+x)*4, di=y*(size*4+1)+1+x*4;
      raw[di]=pixels[si]; raw[di+1]=pixels[si+1];
      raw[di+2]=pixels[si+2]; raw[di+3]=pixels[si+3];
    }
  }

  const idat = zlib.deflateSync(raw, { level:6 });
  const png  = Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
  console.log(`Zapsáno: ${file} (${size}×${size}px, ${(png.length/1024).toFixed(1)} KB)`);
}

// ---- PNG parser ----
function parsePNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8; // přeskočit signaturu

  let width, height, idat = [];

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos); pos += 4;
    const type   = buf.toString('ascii', pos, pos+4); pos += 4;
    const data   = buf.slice(pos, pos+length); pos += length;
    pos += 4; // CRC

    if (type === 'IHDR') {
      width  = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth  = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6)
        throw new Error(`Nepodporovaný PNG formát: bitDepth=${bitDepth}, colorType=${colorType}`);
    }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const pixels = new Uint8Array(width * height * 4);

  // Rekonstrukce filtrů
  const prev = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const row    = raw.slice(y * stride + 1, y * stride + 1 + width * 4);
    const curr   = new Uint8Array(width * 4);

    for (let i = 0; i < row.length; i++) {
      const a = i >= 4 ? curr[i-4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i-4] : 0;
      let v;
      switch (filter) {
        case 0: v = row[i]; break;
        case 1: v = (row[i] + a) & 0xFF; break;
        case 2: v = (row[i] + b) & 0xFF; break;
        case 3: v = (row[i] + Math.floor((a+b)/2)) & 0xFF; break;
        case 4: {
          const p = a+b-c;
          const pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
          v = (row[i] + (pa<=pb&&pa<=pc?a:pb<=pc?b:c)) & 0xFF; break;
        }
        default: throw new Error(`Neznámý filtr: ${filter}`);
      }
      curr[i] = v;
    }
    prev.set(curr);
    pixels.set(curr, y * width * 4);
  }

  return { width, height, pixels };
}

// ---- Nearest-neighbor škálování ----
function scalePixels(src, srcW, srcH, dstSize) {
  const dst = new Uint8Array(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.floor(y * srcH / dstSize);
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.floor(x * srcW / dstSize);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstSize + x) * 4;
      dst[di]   = src[si];
      dst[di+1] = src[si+1];
      dst[di+2] = src[si+2];
      dst[di+3] = src[si+3];
    }
  }
  return dst;
}

// Načíst zdroj a vygenerovat ikony
const src = parsePNG('favicon-32x32.png');
console.log(`Zdroj: ${src.width}×${src.height}px`);

writePNG(scalePixels(src.pixels, src.width, src.height, 192), 192, 'icon-192.png');
writePNG(scalePixels(src.pixels, src.width, src.height, 512), 512, 'icon-512.png');
