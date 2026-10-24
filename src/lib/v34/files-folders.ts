/**
 * The Files page's folders, shared with the Spaces drawer (Coy, 2026-10-24: "can we move this nested
 * under the files tool in the drawer?"). While the Files page is open it publishes its folder column
 * here and the drawer lists it under its Files row; a pick there opens that folder on the page.
 * Nothing is kept once the page closes, like `vendor-filter.ts`.
 */
import { useSyncExternalStore } from "react";

export interface FolderItem { id: string; label: string; n?: number; on: boolean }
export interface FolderGroup { key: string; label: string; items: FolderItem[]; loading: boolean; on: boolean }
export interface FilesFolders {
  /** null while the Files page isn't open. */
  top: FolderItem[] | null;
  kinds: FolderItem[];
  groups: FolderGroup[];
}

let state: FilesFolders = { top: null, kinds: [], groups: [] };
let picker: ((id: string) => void) | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };

export function setFilesFolders(next: FilesFolders, pick: (id: string) => void) {
  state = next; picker = pick; emit();
}
export function clearFilesFolders() {
  state = { top: null, kinds: [], groups: [] }; picker = null; emit();
}
export function pickFilesFolder(id: string) { picker?.(id); }

function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
const get = () => state;
export function useFilesFolders(): FilesFolders {
  return useSyncExternalStore(subscribe, get, get);
}
