import { useSyncExternalStore } from "react";

/** لقطة مختصرة من الشاشة المفتوحة تُرسل للمساعد مع كل سؤال */
export type AssistantScreenSnapshot = {
  kind: string;
  title: string;
  summary: string;
  updatedAt: number;
};

let current: AssistantScreenSnapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function publishAssistantScreen(snapshot: Omit<AssistantScreenSnapshot, "updatedAt"> | null) {
  if (!snapshot) {
    if (current === null) return;
    current = null;
    emit();
    return;
  }
  const next: AssistantScreenSnapshot = {
    ...snapshot,
    summary: snapshot.summary.slice(0, 8000),
    updatedAt: Date.now(),
  };
  // تجنّب إعادة الرسم لو النص نفسه
  if (
    current &&
    current.kind === next.kind &&
    current.title === next.title &&
    current.summary === next.summary
  ) {
    return;
  }
  current = next;
  emit();
}

export function clearAssistantScreen(kind?: string) {
  if (kind && current && current.kind !== kind) return;
  publishAssistantScreen(null);
}

export function getAssistantScreen() {
  return current;
}

export function subscribeAssistantScreen(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAssistantScreen() {
  return useSyncExternalStore(subscribeAssistantScreen, getAssistantScreen, () => null);
}
