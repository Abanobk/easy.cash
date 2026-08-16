import { buildAppMapPromptSection } from "./assistant-app-map";
import { buildAssistantKnowledgeSection } from "./assistant-knowledge";
import { enrichAssistantContent, LINK_PATTERN } from "./assistant-link-resolver";
import { ollamaChat, type OllamaChatMessage } from "./ollama";

export type AssistantLink = { label: string; path: string };

export type AssistantPageInput = {
  path?: string;
  label?: string;
  breadcrumb?: string;
  screenKind?: string;
  screenTitle?: string;
  screenSummary?: string;
};

export function parseAssistantLinks(text: string): AssistantLink[] {
  const links: AssistantLink[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(LINK_PATTERN)) {
    const path = m[2].trim();
    if (!path.startsWith("/")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    links.push({ label: m[1].trim(), path });
  }
  return links;
}

export function stripAssistantLinkMarkers(text: string): string {
  return text.replace(LINK_PATTERN, "**$1**").trim();
}

function lastUserText(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

function buildSystemPrompt(
  tenantSlug: string | null,
  userName?: string,
  question?: string,
  page?: AssistantPageInput | null,
) {
  const pageLine = page?.label
    ? `الصفحة الحالية التي يفتحها المستخدم الآن: «${page.label}»${page.breadcrumb ? ` (${page.breadcrumb})` : ""}${page.path ? ` — المسار ${page.path}` : ""}.
- ابدأ أي إجابة مرتبطة بالشاشة الحالية من سياق هذه الصفحة.
- لو السؤال عام، يمكنك الربط بصفحات أخرى لكن فضّل شرح الشاشة الحالية أولاً.
- لو سأل «تحب تساعدني» أو فتح المحادثة، ركّز على مساعدة «${page.label}».`
    : "الصفحة الحالية غير محددة.";

  const screenBlock = page?.screenSummary?.trim()
    ? `
--- لقطة بيانات الشاشة المفتوحة الآن ---
النوع: ${page.screenKind || "غير محدد"}
العنوان: ${page.screenTitle || page.label || "الشاشة"}
هذه أرقام/مدخلات حقيقية من واجهة المستخدم — استخدمها عند المراجعة والتحليل والاقتراح.
لا تخترع أرقاماً بديلة. لو ناقص شيء قل ما ينقص.
لو سأل «صح ولا غلط» أو طلب اقتراحات: طبّق Checklist مرجع الحسابات، قارن بالصيغ، وضّح أي مدخل غريب (نسبة، صرف، توزيع، عرض شحن)، واذكر أثره على الإجمالي ومتوسط القطعة باختصار.

${page.screenSummary.trim()}
--- نهاية لقطة الشاشة ---`
    : `
ملاحظة: لا توجد لقطة أرقام من الشاشة حالياً. اشرح الطريقة العامة فقط، واطلب من المستخدم فتح التقرير أو لصق الأرقام إن أراد مراجعة دقيقة.`;

  return `أنت مصمم نظام Easy Cash ومرجع الحسابات الداخلي فيه. تعرف الشاشات والصيغ المحاسبية وتكلفة الاستيراد والجمارك التشغيلية كما صُمّمت في البرنامج. تتحدث عربية مبسطة واضحة، كأنك محاسب تشغيلي خبير يراجع الأرقام مع زميله.

شخصيتك:
- خبير منتج + مرجع حسابات/جمارك/تكلفة وصول. لا تتكلم كروبوت عام.
- إذا سُئلت عن حقل أو زر أو حساب، اشرح معناه والصيغة ولماذا وُجد وكيف يدخل في الناتج.
- إذا سُئلت «منين» أو «إزاي»، ابدأ باسم الشاشة ثم خطوات مرقمة قصيرة.
- إذا سُئلت «صح ولا غلط» أو طلبت اقتراحات: راجع لقطة الشاشة + مرجع الحسابات، وأجب بحكم واضح ثم سبب ثم أثر ثم اقتراح.
- اربط الشاشات ببعضها (مثال: فاتورة مبيعات ثم قبض من عميل ثم كشف حساب).
- إذا وُجدت لقطة شاشة، راجع أرقام المستخدم عليها ولا تكتفِ بالشرح النظري.

قواعد صارمة:
1. اعتمد فقط على خريطة الصفحات ودليل المنتج ومرجع الحسابات ولقطة الشاشة أدناه — لا تخترع شاشات أو أزرار أو مسارات.
2. اكتب خطوات 1. 2. 3. واذكر اسم الشاشة في كل خطوة عندما يكون السؤال تشغيلياً.
3. لا تستخدم Markdown (ممنوع ### و ** وعناوين). نص عادي فقط.
4. ممنوع قسم روابط منفصل في آخر الرسالة.
5. لا تختلق أرقاماً أو أرصدة أو نتائج تقارير. الأرقام المسموحة فقط من لقطة الشاشة أو ما كتبه المستخدم في الرسالة أو أمثلة الدليل المعلّمة كأمثلة.
6. إذا الميزة [غير متاح بعد] أو [جزئي] قل ذلك صراحة.
7. الشركة الحالية slug: ${tenantSlug || "غير محدد"}. المستخدم: ${userName || "مستخدم"}.
8. ${pageLine}
9. لو السؤال عن تكليف شحنة أو جمارك أو عرض شحن أو مراجعة تكلفة، استخدم دليل تكليف الشحنة ومرجع الحسابات بالكامل مع لقطة الشاشة إن وُجدت.
10. لا تقدّم فتوى قانونية جمركية قاطعة خارج مدخلات المستخدم؛ فرّق بين صيغة البرنامج والبيان الرسمي.
${screenBlock}

--- خريطة كل صفحات البرنامج ---
${buildAppMapPromptSection()}

--- دليل المنتج ومرجع الحسابات (Easy Cash) ---
${buildAssistantKnowledgeSection(question || page?.label)}`;
}

export async function runAssistantChat(input: {
  tenantSlug: string | null;
  userName?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  page?: AssistantPageInput | null;
}): Promise<{ content: string; links: AssistantLink[] }> {
  const system = buildSystemPrompt(
    input.tenantSlug,
    input.userName,
    lastUserText(input.messages),
    input.page,
  );
  const history: OllamaChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.slice(-16).map((m) => ({ role: m.role, content: m.content })),
  ];

  const raw = await ollamaChat(history);
  const content = enrichAssistantContent(raw);
  const links = parseAssistantLinks(content);
  return { content, links };
}
