"use client";
/**
 * The signed-in person's access (migration 081), from /api/session/me, for
 * any page that hides what an onsite estimator can't open. Full access until
 * known — the database, not this, is what keeps an estimator out.
 */
import { createContext, useContext } from "react";
import { FULL_ACCESS, type Access } from "@/lib/access";

export const AccessContext = createContext<Access>(FULL_ACCESS);
export const useAccess = () => useContext(AccessContext);
