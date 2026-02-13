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

