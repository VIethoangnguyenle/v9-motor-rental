const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL ?? "http://localhost:8055";

/**
 * Ảnh luôn đi qua preset `web` (§4.4 design doc). KHÔNG dùng `?width=` tuỳ ý —
 * transform tuỳ ý đã bị chặn ở Directus, và mở lại là mở một vòi CPU cho bot.
 * next/image tự sinh các cỡ responsive từ ảnh này.
 */
export function assetUrl(fileId: string): string {
  return `${DIRECTUS_URL}/assets/${fileId}?key=web`;
}
