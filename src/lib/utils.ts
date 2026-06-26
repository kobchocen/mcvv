import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse JPEG/PNG buffer for pixel dimensions (no external deps). */
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (!buffer || buffer.length < 10) return null;

  // JPEG (SOF0 / SOF2)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
        const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
        return { width, height };
      }
      if (marker === 0xda || marker === 0xd9) break;
      const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
      offset += 2 + segmentLength;
    }
  }

  // PNG (IHDR)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  return null;
}

export function isPortraitImage(buffer: Buffer): boolean {
  const dims = getImageDimensions(buffer);
  return !!(dims && dims.height > dims.width);
}

/** Convert race time in seconds to MM:SS format (e.g. 910 -> "15:10") */
export function formatRaceTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
