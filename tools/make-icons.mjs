// Erzeugt die PNG-Symbole aus derselben Zeichnung wie public/icon.svg (ohne Abhängigkeiten).
// Aufruf: node tools/make-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const BG = [0x2f, 0x7d, 0x4f];
const FG = [255, 255, 255];

// Zeichnung im 512er-Raster: Linienzüge mit Strichbreite 28 (Halbbreite 14) und zwei Räder.
const STROKE = 14;
const LINES = [
  [[120, 190], [392, 190], [364, 340], [148, 340], [120, 190]],
  [[120, 190], [106, 144], [80, 144]],
];
const WHEELS = [[180, 392], [332, 392]];
const WHEEL_R = 16;

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideArt(x, y) {
  for (const line of LINES) {
    for (let i = 0; i < line.length - 1; i++) if (distToSegment(x, y, line[i], line[i + 1]) <= STROKE) return true;
  }
  return WHEELS.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= WHEEL_R);
}

// Rundes Rechteck (Halbmesser r) im 512er-Raster.
function insideRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// scale: Größe der Zeichnung relativ zum Symbol; rounded: transparente Ecken (für "any"), sonst vollflächig (maskable/iOS).
function render(size, { scale, rounded }) {
  const SS = 3;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((pxl + (sx + 0.5) / SS) / size) * 512;
          const y = ((py + (sy + 0.5) / SS) / size) * 512;
          if (!rounded || insideRoundRect(x, y, 96)) {
            bg++;
            if (insideArt(256 + (x - 256) / scale, 256 + (y - 256) / scale)) fg++;
          }
        }
      }
      const n = SS * SS, i = (py * size + pxl) * 4;
      const a = bg / n, f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const jobs = [
  ["icon-192.png", 192, { scale: 1, rounded: true }],
  ["icon-512.png", 512, { scale: 1, rounded: true }],
  ["icon-maskable-512.png", 512, { scale: 0.7, rounded: false }], // Sicherheitszone: Zeichnung bleibt im inneren Kreis
  ["apple-touch-icon.png", 180, { scale: 0.85, rounded: false }],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(path.join(OUT, name), png(size, render(size, opts)));
  console.log("geschrieben:", name);
}
