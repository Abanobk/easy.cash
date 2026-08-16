import type { Message } from "@/components/AIChatBox";

export type AssistantSession = {
  open: boolean;
  messages: Message[];
};

const key = (slug: string) => `easy-cash-assistant:${slug}`;

export function loadAssistantSession(slug: string): AssistantSession {
  try {
    const raw = sessionStorage.getItem(key(slug));
    if (!raw) return { open: false, messages: [] };
    const data = JSON.parse(raw) as AssistantSession;
    return {
      open: Boolean(data.open),
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch {
    return { open: false, messages: [] };
  }
}

export function saveAssistantSession(slug: string, session: AssistantSession) {
  try {
    sessionStorage.setItem(key(slug), JSON.stringify(session));
  } catch {
    /* ignore quota */
  }
}

export function clearAssistantSession(slug: string) {
  sessionStorage.removeItem(key(slug));
}
