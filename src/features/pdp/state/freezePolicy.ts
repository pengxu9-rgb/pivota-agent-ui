import type { MediaItem, Module } from '../types';

export interface ModuleSourceLocks {
  reviews: boolean;
  similar: boolean;
  ugc: boolean;
}

export const DEFAULT_MODULE_SOURCE_LOCKS: ModuleSourceLocks = {
  reviews: false,
  similar: false,
  ugc: false,
};

export type LockableModuleType = 'reviews_preview' | 'recommendations';
export type UgcSource = 'reviews' | 'media' | null;

export interface UgcSourceSnapshot {
  locked: boolean;
  source: UgcSource;
  items: MediaItem[];
}

export const DEFAULT_UGC_SNAPSHOT: UgcSourceSnapshot = {
  locked: false,
  source: null,
  items: [],
};

export const UGC_PREVIEW_PRIORITY_COUNT = 6;

export function findModuleByType(
  modules: Module[] | undefined,
  type: LockableModuleType,
): Module | null {
  if (!Array.isArray(modules)) return null;
  return modules.find((m) => m?.type === type) || null;
}

export function upsertLockedModule(args: {
  currentModules: Module[] | undefined;
  type: LockableModuleType;
  nextModule: Module | null;
  locked: boolean;
}): { modules: Module[]; locked: boolean; changed: boolean } {
  const modules = Array.isArray(args.currentModules)
    ? [...args.currentModules]
    : [];
  const existingIdx = modules.findIndex((m) => m?.type === args.type);

  // Freeze policy: once this module type has been rendered and locked, ignore
  // background refresh updates unless user performs an explicit refresh action.
  if (args.locked && existingIdx >= 0) {
    return {
      modules,
      locked: true,
      changed: false,
    };
  }

  if (!args.nextModule) {
    return {
      modules,
      locked: args.locked,
      changed: false,
    };
  }

  if (existingIdx >= 0) {
    modules[existingIdx] = args.nextModule;
  } else {
    modules.push(args.nextModule);
  }

  return {
    modules,
    locked: true,
    changed: true,
  };
}

export function lockFirstUgcSource(args: {
  current: UgcSourceSnapshot;
  reviewsItems: MediaItem[];
  mediaItems: MediaItem[];
}): UgcSourceSnapshot {
  if (args.current.locked) return args.current;
  if (Array.isArray(args.reviewsItems) && args.reviewsItems.length > 0) {
    return {
      locked: true,
      source: 'reviews',
      items: [...args.reviewsItems],
    };
  }
  if (Array.isArray(args.mediaItems) && args.mediaItems.length > 0) {
    return {
      locked: true,
      source: 'media',
      items: [...args.mediaItems],
    };
  }
  return args.current;
}

function mediaItemKey(item: MediaItem): string {
  const type = String(item?.type || '').trim().toLowerCase();
  const url = String(item?.url || '').trim();
  return `${type}|${url}`;
}

function dedupeMediaItems(items: MediaItem[]): MediaItem[] {
  const out: MediaItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.url) continue;
    const key = mediaItemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function mergeUgcItems(args: {
  reviewsItems: MediaItem[];
  mediaItems: MediaItem[];
  priorityCount?: number;
}): MediaItem[] {
  const reviews = dedupeMediaItems(Array.isArray(args.reviewsItems) ? args.reviewsItems : []);
  const media = dedupeMediaItems(Array.isArray(args.mediaItems) ? args.mediaItems : []);
  const priorityCount = Math.max(1, Math.floor(args.priorityCount ?? UGC_PREVIEW_PRIORITY_COUNT));

  const head: MediaItem[] = [];
  const used = new Set<string>();
  const pushHead = (item: MediaItem) => {
    if (head.length >= priorityCount) return;
    const key = mediaItemKey(item);
    if (!key || used.has(key)) return;
    used.add(key);
    head.push(item);
  };

  for (const item of reviews) pushHead(item);
  if (head.length < priorityCount) {
    for (const item of media) pushHead(item);
  }

  const tail: MediaItem[] = [];
  const ordered = [...reviews, ...media];
  for (const item of ordered) {
    const key = mediaItemKey(item);
    if (!key || used.has(key)) continue;
    used.add(key);
    tail.push(item);
  }

  return [...head, ...tail];
}
