export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaModelTier = "default" | "heavy";

type OllamaTag = { name: string; size?: number };

/** نفس إعدادات Easy Tech (Flutter App 2) */
const EASYTECH_DEFAULT_MODEL = "qwen3:14b";
const EASYTECH_HEAVY_MODEL = "qwen3:14b";

const LEGACY_DEFAULTS = new Set([
  "auto",
  "qwen2.5:14b",
  "qwen2.5:7b",
  "qwen2.5:3b",
  "llama3.2",
  "llama3.2:latest",
  "llama3.1:8b",
  "llama3:8b",
]);

let modelCache: { at: number; defaultModel: string; heavyModel: string } | null = null;

export function getOllamaConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434").replace(/\/$/, "");
  const configured = (process.env.OLLAMA_MODEL || "auto").trim() || "auto";
  const heavyConfigured = (process.env.OLLAMA_MODEL_HEAVY || "").trim();
  const enabled = process.env.OLLAMA_ENABLED !== "0";
  return { baseUrl, model: configured, heavyModel: heavyConfigured, enabled };
}

function scoreModel(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("embed") || n.includes("llava") || n.includes("vision") || n.includes("clip") || n.includes("-vl")) {
    return -1000;
  }

  let score = 0;
  const size = n.match(/(\d+(?:\.\d+)?)\s*b/);
  if (size) score += Number(size[1]) * 10;

  // مطابقة أولوية Easy Tech: qwen3 أولاً
  if (n.includes("qwen3")) score += 50;
  else if (n.includes("qwen2.5")) score += 32;
  else if (n.includes("qwen2")) score += 22;
  else if (n.includes("deepseek")) score += 30;
  else if (n.includes("llama3.3")) score += 28;
  else if (n.includes("llama3.1")) score += 20;
  else if (n.includes("mistral") || n.includes("mixtral")) score += 16;
  else if (n.includes("gemma")) score += 12;

  if (n.includes("instruct") || n.includes("chat") || n.includes("it")) score += 6;
  if (n.includes("coder")) score -= 8;
  return score;
}

function pickStrongest(names: string[]): string | undefined {
  if (!names.length) return undefined;
  return [...names].sort((a, b) => scoreModel(b) - scoreModel(a))[0];
}

async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { models?: OllamaTag[] };
  return (data.models || []).map((m) => m.name).filter(Boolean);
}

function nameMatches(installed: string[], wanted: string): string | undefined {
  return installed.find((n) => n === wanted || n === `${wanted}:latest` || n.startsWith(`${wanted}:`));
}

function preferEasyTech(installed: string[], wanted: string): string | undefined {
  return nameMatches(installed, wanted) || nameMatches(installed, wanted.replace(/:latest$/, ""));
}

async function resolveModelPair(): Promise<{ defaultModel: string; heavyModel: string }> {
  const { baseUrl, model: configured, heavyModel: heavyConfigured } = getOllamaConfig();
  if (modelCache && Date.now() - modelCache.at < 120_000) {
    return { defaultModel: modelCache.defaultModel, heavyModel: modelCache.heavyModel };
  }

  let installed: string[] = [];
  try {
    installed = await listOllamaModels(baseUrl);
  } catch {
    const fallbackDefault = configured === "auto" ? EASYTECH_DEFAULT_MODEL : configured;
    const fallbackHeavy = heavyConfigured || EASYTECH_HEAVY_MODEL;
    return { defaultModel: fallbackDefault, heavyModel: fallbackHeavy || fallbackDefault };
  }

  const strongest = pickStrongest(installed);
  const preferStrongest = process.env.OLLAMA_PREFER_STRONGEST !== "0";
  const easyTechHit = preferEasyTech(installed, EASYTECH_DEFAULT_MODEL);

  let defaultModel: string;
  if (configured !== "auto" && !LEGACY_DEFAULTS.has(configured)) {
    defaultModel = nameMatches(installed, configured) || configured;
  } else if (easyTechHit) {
    // نفس موديل Flutter App 2 إن وُجد
    defaultModel = easyTechHit;
  } else if (preferStrongest && strongest) {
    defaultModel = strongest;
  } else {
    defaultModel =
      nameMatches(installed, configured) ||
      easyTechHit ||
      strongest ||
      EASYTECH_DEFAULT_MODEL;
  }

  const heavyWanted = heavyConfigured || EASYTECH_HEAVY_MODEL;
  const heavyModel =
    preferEasyTech(installed, heavyWanted) ||
    nameMatches(installed, heavyWanted) ||
    (scoreModel(defaultModel) > 0 ? defaultModel : strongest) ||
    defaultModel;

  modelCache = { at: Date.now(), defaultModel, heavyModel };
  return { defaultModel, heavyModel };
}

export async function resolveOllamaModel(tier: OllamaModelTier = "default"): Promise<string> {
  const pair = await resolveModelPair();
  return tier === "heavy" ? pair.heavyModel : pair.defaultModel;
}

/** qwen3 أحياناً يلف الرد داخل <think> حتى مع think:false */
export function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/?think>\s*/gi, "")
    .trim();
}

export async function ollamaHealthCheck(): Promise<{
  ok: boolean;
  model?: string;
  heavyModel?: string;
  error?: string;
}> {
  const { baseUrl, enabled } = getOllamaConfig();
  if (!enabled) return { ok: false, error: "OLLAMA_ENABLED=0" };
  try {
    const installed = await listOllamaModels(baseUrl);
    if (!installed.length) return { ok: false, error: "لا توجد نماذج على Ollama" };
    const pair = await resolveModelPair();
    return { ok: true, model: pair.defaultModel, heavyModel: pair.heavyModel };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export async function ollamaChat(
  messages: OllamaChatMessage[],
  opts?: { numPredict?: number; temperature?: number; tier?: OllamaModelTier },
): Promise<string> {
  const { baseUrl, enabled } = getOllamaConfig();
  if (!enabled) throw new Error("مساعد الذكاء الاصطناعي غير مفعّل على السيرفر");
  const model = await resolveOllamaModel(opts?.tier ?? "default");

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      keep_alive: "30m",
      // qwen3: إيقاف سلسلة التفكير الظاهرة إن دعمها السيرفر
      think: false,
      options: {
        temperature: opts?.temperature ?? 0.15,
        top_p: 0.85,
        num_predict: opts?.numPredict ?? 4096,
        num_ctx: 32768,
      },
    }),
    signal: AbortSignal.timeout(420_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = stripThinkBlocks(data.message?.content || "");
  if (!content) throw new Error("رد فارغ من Ollama");
  return content;
}

function scoreVisionModel(name: string): number {
  const n = name.toLowerCase();
  // Ollama registry: qwen2.5vl (no hyphen); also accept qwen2.5-vl / qwen2vl aliases
  const isVision =
    n.includes("llava") ||
    n.includes("vision") ||
    n.includes("minicpm-v") ||
    n.includes("moondream") ||
    n.includes("qwen2.5vl") ||
    n.includes("qwen2.5-vl") ||
    n.includes("qwen2vl") ||
    n.includes("qwen2-vl") ||
    n.includes("qwen3vl") ||
    n.includes("qwen3-vl");
  if (!isVision) return -1000;
  let score = 10;
  const size = n.match(/(\d+(?:\.\d+)?)\s*b/);
  if (size) score += Number(size[1]) * 10;
  if (n.includes("qwen3vl") || n.includes("qwen3-vl")) score += 50;
  else if (n.includes("qwen2.5vl") || n.includes("qwen2.5-vl")) score += 40;
  else if (n.includes("qwen2vl") || n.includes("qwen2-vl")) score += 30;
  else if (n.includes("llava")) score += 20;
  return score;
}

async function resolveVisionModel(): Promise<string | null> {
  const { baseUrl } = getOllamaConfig();
  const pinned = (process.env.OLLAMA_VISION_MODEL || "").trim();
  try {
    const installed = await listOllamaModels(baseUrl);
    if (pinned) {
      const hit = nameMatches(installed, pinned);
      if (hit) return hit;
    }
    const vision = [...installed].sort((a, b) => scoreVisionModel(b) - scoreVisionModel(a))[0];
    if (vision && scoreVisionModel(vision) > 0) return vision;
  } catch {
    /* ignore */
  }
  return null;
}

/** استخراج حقول من صورة مستند عبر نموذج vision إن وُجد */
export async function ollamaVisionExtract(opts: {
  mimeType: string;
  imageBase64: string;
  prompt: string;
}): Promise<string> {
  const { baseUrl, enabled } = getOllamaConfig();
  if (!enabled) throw new Error("Ollama غير مفعّل");
  const model = await resolveVisionModel();
  if (!model) throw new Error("لا يوجد نموذج رؤية (vision) على Ollama");

  const b64 = opts.imageBase64.replace(/^data:[^;]+;base64,/, "");
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: opts.prompt,
          images: [b64],
        },
      ],
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 1024 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama vision ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = stripThinkBlocks(data.message?.content || "");
  if (!content) throw new Error("رد فارغ من نموذج الرؤية");
  return content;
}
