import { renderSVG } from "uqr";
import { buildTenantLoginUrl } from "./tenant-login";

export function buildTenantLoginQrSvg(loginUrl: string, pixelSize = 7) {
  return renderSVG(loginUrl, {
    pixelSize,
    whiteColor: "#ffffff",
    blackColor: "#1e40af",
    border: 2,
    ecc: "M",
  });
}

export function buildTenantLoginQrDataUrl(loginUrl: string) {
  const svg = buildTenantLoginQrSvg(loginUrl);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildTenantLoginQrForSlug(slug: string, origin?: string) {
  const url = buildTenantLoginUrl(slug, origin);
  return { url, svg: buildTenantLoginQrSvg(url), dataUrl: buildTenantLoginQrDataUrl(url) };
}

export async function downloadTenantLoginQrPng(slug: string, companyName: string) {
  const { url, dataUrl } = buildTenantLoginQrForSlug(slug);
  const safeName = (companyName || slug).replace(/[^\w\u0600-\u06FF-]+/g, "-");
  const filename = `easy-cash-login-${safeName}.png`;

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Export failed"));
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        resolve();
      }, "image/png");
    };
    img.onerror = () => reject(new Error("QR render failed"));
    img.src = dataUrl;
  });

  return { url, filename };
}
