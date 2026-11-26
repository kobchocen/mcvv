import type { OfficialLogoImage } from "./official-logo-shared";

/** Sestaví popis rastru z PNG bytů (prohlížeč i Node). */
export function loadOfficialLogoFromBytes(data: Uint8Array): OfficialLogoImage {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) {
    throw new Error("Official MCVV logo is not a PNG");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    data,
    pixelWidth: view.getUint32(16),
    pixelHeight: view.getUint32(20),
  };
}
