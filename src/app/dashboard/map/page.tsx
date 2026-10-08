"use client";

/** The Map — every job and vendor as a pin, and satellite clips into Takeoffs (src/components/v34/map/map-page.tsx). */

import { Suspense } from "react";
import { MapPage } from "@/components/v34/map/map-page";

export default function MapScreen() {
  return <Suspense fallback={null}><MapPage /></Suspense>;
}
