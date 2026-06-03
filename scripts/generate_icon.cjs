// Generate a valid ICO file with 32x32, 64x64, and 256x256 resolutions
// Uses BMP format inside ICO with proper DIB headers

const fs = require('fs');
const path = require('path');

// Colors
const BG_COLOR = [0x1a, 0x0d, 0x09];        // #090D1A
const BALL_COLOR = [0x6c, 0x3e, 0xff];      // #FF3E6C
const WHITE = [0xff, 0xff, 0xff];
const DARK = [0x33, 0x22, 0x11];
const LIGHT = [0x66, 0x44, 0x22];

// Generate pixel color at (x, y) for a width x height canvas
function getPixelColor(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = Math.min(width, height) * 0.38;

  if (dist <= maxR) {
    const pentR = maxR * 0.35;
    if (dist < pentR) {
      return [...BALL_COLOR];
    }
    const checkX = Math.floor((dx / maxR * 6 + 6) / 2);
    const checkY = Math.floor((dy / maxR * 6 + 6) / 2);
    const base = (checkX + checkY) % 2 === 0 ? DARK : LIGHT;
    // Highlight
    if (dist < maxR * 0.25 && dx < 0 && dy < 0) {
      return [Math.min(255, base[0] + 80), Math.min(255, base[1] + 80), Math.min(255, base[2] + 80)];
    }
    return [...base];
  } else if (dist <= maxR + 3) {
    return [...WHITE];
  } else {
    const grad = 1 - (dist - maxR - 3) / (Math.max(width, height) * 0.5);
    const brightness = Math.max(0, Math.min(1, grad * 0.3));
    return [
      Math.floor(BG_COLOR[0] * (1 - brightness)),
      Math.floor(BG_COLOR[1] * (1 - brightness)),
      Math.floor(BG_COLOR[2] * (1 - brightness)),
    ];
  }
}

// Create BMP data for ICO (format: DIB header + XOR data + AND mask)
// For ICO, biHeight = actual_height * 2
function createICOBMP(width, height) {
  const bpp = 32; // 32-bit BGRA for proper transparency
  const rowSizeXOR = Math.floor((bpp * width + 31) / 32) * 4; // row stride for XOR
  const xorDataSize = rowSizeXOR * height;

  const andBPP = 1;
  const rowSizeAND = Math.floor((andBPP * width + 31) / 32) * 4; // row stride for AND
  const andDataSize = rowSizeAND * height;

  const dibSize = 40; // BITMAPINFOHEADER
  const totalSize = dibSize + xorDataSize + andDataSize;
  const buf = Buffer.alloc(totalSize);

  // DIB Header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 0);      // biSize
  buf.writeInt32LE(width, 4);    // biWidth
  buf.writeInt32LE(height * 2, 8); // biHeight = height * 2 for ICO
  buf.writeUInt16LE(1, 12);      // biPlanes
  buf.writeUInt16LE(bpp, 14);    // biBitCount
  buf.writeUInt32LE(0, 16);      // biCompression (BI_RGB)

  // XOR mask (BGRA, bottom-up)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = getPixelColor(x, y, width, height);
      const bottomUpY = height - 1 - y;
      const offset = dibSize + bottomUpY * rowSizeXOR + x * 4;
      buf[offset] = color[2];       // B
      buf[offset + 1] = color[1];   // G
      buf[offset + 2] = color[0];   // R
      buf[offset + 3] = 255;        // A (fully opaque)
    }
  }

  // AND mask (1 bit per pixel, all zeros = opaque, bottom-up)
  // Since we're using 32-bit BGRA with alpha, AND mask can be all zeros
  const andStart = dibSize + xorDataSize;
  for (let y = 0; y < height; y++) {
    const bottomUpY = height - 1 - y;
    const offset = andStart + bottomUpY * rowSizeAND;
    // All zeros = no additional transparency mask needed
    for (let b = 0; b < rowSizeAND; b++) {
      buf[offset + b] = 0;
    }
  }

  return buf;
}

// Simple 24-bit BMP for smaller sizes (for backward compatibility)
function createSimpleBMP(width, height) {
  const bpp = 24;
  const rowSizeXOR = Math.floor((bpp * width + 31) / 32) * 4;
  const xorDataSize = rowSizeXOR * height;

  const andBPP = 1;
  const rowSizeAND = Math.floor((andBPP * width + 31) / 32) * 4;
  const andDataSize = rowSizeAND * height;

  const dibSize = 40;
  const totalSize = dibSize + xorDataSize + andDataSize;
  const buf = Buffer.alloc(totalSize);

  // DIB Header
  buf.writeUInt32LE(40, 0);
  buf.writeInt32LE(width, 4);
  buf.writeInt32LE(height * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(bpp, 14);
  buf.writeUInt32LE(0, 16);

  // XOR mask (BGR, bottom-up)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = getPixelColor(x, y, width, height);
      const bottomUpY = height - 1 - y;
      const offset = dibSize + bottomUpY * rowSizeXOR + x * 3;
      buf[offset] = color[2];       // B
      buf[offset + 1] = color[1];   // G
      buf[offset + 2] = color[0];   // R
    }
  }

  // AND mask (all zeros)
  const andStart = dibSize + xorDataSize;
  for (let y = 0; y < height; y++) {
    const bottomUpY = height - 1 - y;
    const offset = andStart + bottomUpY * rowSizeAND;
    for (let b = 0; b < rowSizeAND; b++) {
      buf[offset + b] = 0;
    }
  }

  return buf;
}

function createICO(entries) {
  const numEntries = entries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let currentOffset = headerSize + numEntries * dirEntrySize;

  // Calculate total size
  let totalSize = currentOffset;
  for (const entry of entries) {
    totalSize += entry.data.length;
  }

  const icoBuf = Buffer.alloc(totalSize);

  // ICO Header
  icoBuf.writeUInt16LE(0, 0);   // reserved
  icoBuf.writeUInt16LE(1, 2);   // type: ICO
  icoBuf.writeUInt16LE(numEntries, 4); // count

  // Directory entries
  let dirOffset = headerSize;
  for (const entry of entries) {
    const w = entry.width === 256 ? 0 : entry.width;
    const h = entry.height === 256 ? 0 : entry.height;
    icoBuf[dirOffset] = w;
    icoBuf[dirOffset + 1] = h;
    icoBuf[dirOffset + 2] = 0;   // colors
    icoBuf[dirOffset + 3] = 0;   // reserved
    icoBuf.writeUInt16LE(1, dirOffset + 4); // planes
    icoBuf.writeUInt16LE(entry.bpp || 32, dirOffset + 6); // bpp
    icoBuf.writeUInt32LE(entry.data.length, dirOffset + 8); // size
    icoBuf.writeUInt32LE(currentOffset, dirOffset + 12); // offset

    // Copy image data
    entry.data.copy(icoBuf, currentOffset);
    currentOffset += entry.data.length;
    dirOffset += 16;
  }

  return icoBuf;
}

// Create ICO with multiple sizes
const iconData = createICO([
  { width: 32, height: 32, data: createSimpleBMP(32, 32), bpp: 24 },
  { width: 64, height: 64, data: createICOBMP(64, 64), bpp: 32 },
  { width: 256, height: 256, data: createICOBMP(256, 256), bpp: 32 },
]);

const outputPath = path.join(__dirname, '..', 'public', 'icon.ico');
fs.writeFileSync(outputPath, iconData);
console.log(`ICO icon generated: ${outputPath} (${iconData.length} bytes, sizes: 32/64/256)`);