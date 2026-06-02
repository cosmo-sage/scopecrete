"use client";

import { Lightning } from "@phosphor-icons/react";

interface DustyFABProps {
  onClick: () => void;
}

export default function DustyFAB({ onClick }: DustyFABProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Open Dusty assistant"
      className="flex flex-col items-center justify-center w-14 h-14 rounded-full shrink-0 transition-all active:scale-90"
      style={{
        background: "#e85d04",
        boxShadow: "0 0 20px rgba(232,93,4,0.5), 0 0 40px rgba(232,93,4,0.2)",
        cursor: "pointer",
        border: "none",
        zIndex: 50,
      }}
    >
      <Lightning size={22} weight="fill" color="white" />
    </button>
  );
}