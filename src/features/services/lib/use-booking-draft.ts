'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { BookingContact, BookingRequest, SlotChoice } from './types';

const STORAGE_PREFIX = 'pivota:booking-draft:';

export type BookingDraftState = BookingRequest & {
  bookingDraftId?: string;
  alternates: SlotChoice[];
  contact: BookingContact;
  notes: string;
};

export type BookingDraftAction =
  | { type: 'patch'; patch: Partial<BookingDraftState> }
  | { type: 'set_preferred'; preferred: SlotChoice }
  | { type: 'set_alternates'; alternates: SlotChoice[] }
  | { type: 'set_contact'; contact: BookingContact }
  | { type: 'set_notes'; notes: string }
  | { type: 'reset'; state: BookingDraftState };

type UseBookingDraftArgs = {
  providerId: string;
  listingId?: string;
};

function createDraftId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function activeKey(providerId: string, listingId?: string): string {
  return `${STORAGE_PREFIX}active:${providerId}:${listingId || 'consult'}`;
}

function draftKey(bookingDraftId: string): string {
  return `${STORAGE_PREFIX}${bookingDraftId}`;
}

function createInitialState(providerId: string, listingId?: string): BookingDraftState {
  return {
    provider_id: providerId,
    ...(listingId ? { listing_id: listingId } : {}),
    preferred: { date: '', time: '' },
    alternates: [],
    contact: {},
    notes: '',
  };
}

function withDraftId(state: BookingDraftState): BookingDraftState {
  return state.bookingDraftId ? state : { ...state, bookingDraftId: createDraftId() };
}

function reducer(state: BookingDraftState, action: BookingDraftAction): BookingDraftState {
  if (action.type === 'reset') return action.state;
  const base = withDraftId(state);

  switch (action.type) {
    case 'patch':
      return { ...base, ...action.patch };
    case 'set_preferred':
      return { ...base, preferred: action.preferred };
    case 'set_alternates':
      return { ...base, alternates: action.alternates.slice(0, 5) };
    case 'set_contact':
      return { ...base, contact: action.contact };
    case 'set_notes':
      return { ...base, notes: action.notes.slice(0, 500) };
    default:
      return base;
  }
}

function readStoredDraft(providerId: string, listingId?: string): BookingDraftState | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = window.localStorage.getItem(activeKey(providerId, listingId));
    if (!id) return null;
    const raw = window.localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraftState>;
    if (!parsed || parsed.provider_id !== providerId) return null;
    if ((parsed.listing_id || '') !== (listingId || '')) return null;
    return {
      ...createInitialState(providerId, listingId),
      ...parsed,
      alternates: Array.isArray(parsed.alternates) ? parsed.alternates.slice(0, 5) : [],
      contact: parsed.contact && typeof parsed.contact === 'object' ? parsed.contact : {},
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch {
    return null;
  }
}

export function useBookingDraft({ providerId, listingId }: UseBookingDraftArgs) {
  const initialState = useMemo(
    () => createInitialState(providerId, listingId),
    [providerId, listingId],
  );
  const [draft, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const stored = readStoredDraft(providerId, listingId);
    dispatch({ type: 'reset', state: stored || createInitialState(providerId, listingId) });
  }, [providerId, listingId]);

  const save = useCallback(
    (nextDraft: BookingDraftState = draft): string | null => {
      if (typeof window === 'undefined' || !nextDraft.bookingDraftId) return null;
      window.localStorage.setItem(draftKey(nextDraft.bookingDraftId), JSON.stringify(nextDraft));
      window.localStorage.setItem(activeKey(providerId, listingId), nextDraft.bookingDraftId);
      return nextDraft.bookingDraftId;
    },
    [draft, listingId, providerId],
  );

  useEffect(() => {
    save(draft);
  }, [draft, save]);

  const clear = useCallback(() => {
    if (typeof window !== 'undefined') {
      const id = draft.bookingDraftId || window.localStorage.getItem(activeKey(providerId, listingId));
      if (id) window.localStorage.removeItem(draftKey(id));
      window.localStorage.removeItem(activeKey(providerId, listingId));
    }
    dispatch({ type: 'reset', state: createInitialState(providerId, listingId) });
  }, [draft.bookingDraftId, listingId, providerId]);

  return { draft, dispatch, clear, save };
}
