/**
 * History of what the app read, wrote and changed, kept in one JSON file on this phone.
 * Tag contents are saved; tag passwords, card passphrases, keys and Wi-Fi passwords
 * never are.
 */
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { IconName } from '@/components/Icon';

import { EMPTY_FORM, type DecodedRecord, type WriteForm, type WriteKind } from './ndef';

export type HistoryAction = 'read' | 'write' | 'erase' | 'lock' | 'unlock' | 'secure' | 'unsecure' | 'diagnose';

export interface HistoryRecord {
  kind: string;
  title: string;
  value: string;
  url?: string;
}

export interface HistoryEntry {
  id: string;
  at: number;
  action: HistoryAction;
  ok: boolean;
  /** e.g. "Read NTAG215", "Wrote link". */
  title: string;
  /** Content preview, UID or the error. */
  subtitle: string;
  uid?: string;
  chip?: string;
  records?: HistoryRecord[];
  /** What to prefill for "Write this again". */
  rewrite?: { kind: WriteKind; form: WriteForm };
  details?: { label: string; value: string }[];
}

export type HistoryFilter = 'all' | 'read' | 'written' | 'protected';

export const ACTION_ICON: Record<HistoryAction, IconName> = {
  read: 'scan',
  write: 'pencil',
  erase: 'trash',
  lock: 'lock',
  unlock: 'lock',
  secure: 'lock',
  unsecure: 'lock',
  diagnose: 'wrench',
};

export function matchesFilter(entry: HistoryEntry, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'read':
      return entry.action === 'read' || entry.action === 'diagnose';
    case 'written':
      return entry.action === 'write' || entry.action === 'erase';
    case 'protected':
      return ['lock', 'unlock', 'secure', 'unsecure'].includes(entry.action);
    default:
      return true;
  }
}

/** Decoded records as history keeps them: no raw bytes, and no secret details such as Wi-Fi passwords. */
export function toHistoryRecords(records: DecodedRecord[]): HistoryRecord[] {
  return records.map((r) => ({ kind: r.kind, title: r.title, value: r.value, url: r.url }));
}

/** A write form safe to keep: everything except the Wi-Fi password. */
export function rewriteOf(kind: WriteKind, form: WriteForm): HistoryEntry['rewrite'] {
  return { kind, form: { ...form, wifiPassword: '' } };
}

/** Builds a write form from a record that was read, when it's a kind the app can write. */
export function rewriteFromRecord(record: HistoryRecord | undefined): HistoryEntry['rewrite'] | undefined {
  if (!record) return undefined;
  switch (record.kind) {
    case 'text':
      return { kind: 'text', form: { ...EMPTY_FORM, text: record.value } };
    case 'link':
      return { kind: 'link', form: { ...EMPTY_FORM, link: record.value } };
    case 'phone':
      return { kind: 'phone', form: { ...EMPTY_FORM, phone: record.value } };
    case 'email':
      return { kind: 'email', form: { ...EMPTY_FORM, email: record.value } };
    case 'wifi':
      return { kind: 'wifi', form: { ...EMPTY_FORM, ssid: record.value } };
    default:
      return undefined;
  }
}

/** "Today", "Yesterday", or a date, for grouping the list. */
export function dayLabel(at: number, now = Date.now()): string {
  const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

/* Store ------------------------------------------------------------ */

let entries: HistoryEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

const file = () => new File(Paths.document, 'history.json');

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    const target = file();
    if (!target.exists) target.create();
    target.write(JSON.stringify(entries)).catch(() => {});
  } catch {
    // History is a convenience: a full disk must never break reading or writing tags.
  }
}

/** Loads saved history once, at app start. */
export async function loadHistory(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const source = file();
    if (!source.exists) return;
    const saved: unknown = JSON.parse(await source.text());
    if (Array.isArray(saved)) {
      // Anything logged before the file finished loading stays on top.
      entries = [...entries, ...(saved as HistoryEntry[])];
      emit();
    }
  } catch {
    // An unreadable file starts a fresh history instead of crashing the app.
  }
}

export function addHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
  const saved: HistoryEntry = { ...entry, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
  entries = [saved, ...entries];
  emit();
  persist();
  return saved;
}

export function deleteHistory(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  emit();
  persist();
}

export function clearHistory(): void {
  entries = [];
  emit();
  persist();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Newest first. */
export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}

/** The latest earlier entry for this tag, for "Seen before". */
export function lastSeen(uid: string | undefined, before: number): HistoryEntry | undefined {
  if (!uid) return undefined;
  return entries.find((e) => e.uid === uid && e.at < before);
}
