/* Generátor ikon pro SKK Fit PWA — čistý Node.js bez závislostí */
const zlib = require('zlib');
const fs   = require('fs');

// Pixel font "S" (5×7)
const S_PIX = [
  [0,1,1,1,0],
  [1,0,0,0,1],
  [1,0,0,0,0],
  [0,1,1,1,0],
  [0,0,0,0,1],
  [1,0,0,0,1],
  [0,1,1,1,0],
];

function createIcon(size) {
  const buf = new Uint8Array(size * size * 4);

  const BG    = [7,   17,  31,  255];
  const NAVY  = [12,  28,  53,  255];
  const GOLD  = [245, 166, 35,  255];
  const GOLD2 = [230, 150, 14,  255];
  const WHITE = [228, 240, 255, 255];

  const cx = size / 2, cy = size / 2;

  // Zaplnit černým pozadím
  for (let i = 0; i < buf.length; i += 4) {
    buf[i]=BG[0]; buf[i+1]=BG[1]; buf[i+2]=BG[2]; buf[i+3]=255;
  }

  function setP(x, y, c) {
    if (x<0||x>=size||y<0||y>=size) return;
    const i=(y*size+x)*4;
    buf[i]=c[0]; buf[i+1]=c[1]; buf[i+2]=c[2]; buf[i+3]=c[3];
  }

  // Zaoblený čtverec (tmavě modrý)
  const margin = size * 0.06;
  const rr     = size * 0.22;
  const half   = size / 2 - margin;

  for (let y=0; y<size; y++) {
    for (let x=0; x<size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const ex = Math.max(0, ax - (half - rr));
      const ey = Math.max(0, ay - (half - rr));
      if (Math.sqrt(ex*ex + ey*ey) < rr) setP(x, y, NAVY);
    }
  }

  // Zlatý kroužek
  const rOut = size * 0.395;
  const rIn  = size * 0.275;

  for (let y=0; y<size; y++) {
    for (let x=0; x<size; x++) {
      const dx = x-cx+0.5, dy = y-cy+0.5;
      const d  = Math.sqrt(dx*dx+dy*dy);
      if (d >= rIn && d < rOut) {
        const t = y/size;
        setP(x, y, [
          Math.round(GOLD[0]*(1-t)+GOLD2[0]*t),
          Math.round(GOLD[1]*(1-t)+GOLD2[1]*t),
          Math.round(GOLD[2]*(1-t)+GOLD2[2]*t),
          255
        ]);
      }
    }
  }

  // Písmeno "S" uprostřed
  const sc   = size * 0.063;
  const fW   = 5 * sc, fH = 7 * sc;
  const offX = cx - fW/2, offY = cy - fH/2;

  for (let gy=0; gy<7; gy++) {
    for (let gx=0; gx<5; gx++) {
      if (!S_PIX[gy][gx]) continue;
      const x1=Math.round(offX+gx*sc),     y1=Math.round(offY+gy*sc);
      const x2=Math.round(offX+(gx+1)*sc), y2=Math.round(offY+(gy+1)*sc);
      for (let py=y1; py<y2; py++)
        for (let px=x1; px<x2; px++)
          setP(px, py, WHITE);
    }
  }

  return buf;
}

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
    raw[y*(size*4+1)] = 0; // filter None
    for (let x=0; x<size; x++) {
      const si=(y*size+x)*4, di=y*(size*4+1)+1+x*4;
      raw[di]=pixels[si]; raw[di+1]=pixels[si+1];
      raw[di+2]=pixels[si+2]; raw[di+3]=pixels[si+3];
    }
  }

  const idat = zlib.deflateSync(raw, { level:6 });
  const png  = Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',idat), chunk('IEND',Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
  console.log(`Vygenerováno: ${file} (${size}×${size}px, ${(png.length/1024).toFixed(1)} KB)`);
}

// Generuj obě velikosti
writePNG(createIcon(192), 192, 'icon-192.png');
writePNG(createIcon(512), 512, 'icon-512.png');
