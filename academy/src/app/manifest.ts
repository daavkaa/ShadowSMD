import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Skills Academy",
    short_name: "Academy",
    description: "Монгол хэл дээрх практик ур чадварын академи",
    start_url: "/mn/learn/smm-foundations",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5fc",
    theme_color: "#241a43",
    lang: "mn",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
