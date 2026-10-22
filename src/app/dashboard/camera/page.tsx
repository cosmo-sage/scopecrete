"use client";

/** The site camera — snap photos and video on site, sent in the background (src/components/v34/camera/camera-page.tsx, migration 113). */

import { Suspense } from "react";
import { CameraPage } from "@/components/v34/camera/camera-page";

export default function CameraScreen() {
  return <Suspense fallback={null}><CameraPage /></Suspense>;
}
