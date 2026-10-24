import type { Metadata, Viewport } from "next";
import { CameraLinkPage } from "@/components/v34/camera/camera-link-page";
import "@/styles/v34-shell.css";

/**
 * A customer's camera link (migration 128): public, nobody signs in. The page
 * reads and saves through /api/cam/[token]; shots go from the phone straight to
 * storage as anon, into the link's own folder.
 */
export const metadata: Metadata = { title: "Camera", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover" };

export default async function CameraLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CameraLinkPage token={token} />;
}
