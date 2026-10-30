import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HomePrep",
    short_name: "HomePrep",
    description: "Prepare today. Protect tomorrow.",
    start_url: "/",
    display: "standalone",
    background_color: "#040b11",
    theme_color: "#040b11",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
