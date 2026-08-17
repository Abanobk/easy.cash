import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import AssistantMessageContent from "@/components/AssistantMessageContent";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearAssistantSession,
  loadAssistantSession,
  saveAssistantSession,
} from "@/lib/assistant-session";
import {
  assistantGreeting,
  resolveAssistantPage,
} from "@/lib/assistant-page-context";
import { useAssistantScreen } from "@/lib/assistant-screen";

type Props = { tenantSlug: string; location: string };

export default function AssistantWidget({ tenantSlug, location }: Props) {
  const stored = loadAssistantSession(tenantSlug);
  const [open, setOpen] = useState(stored.open);
  const [messages, setMessages] = useState<Message[]>(stored.messages);
  const page = useMemo(() => resolveAssistantPage(location, tenantSlug), [location, tenantSlug]);
  const screen = useAssistantScreen();
  const screenForPage =
    screen && (page.moduleId !== "import_costing" || screen.kind === "import_costing")
      ? screen
      : null;

  useEffect(() => {
    saveAssistantSession(tenantSlug, { open, messages });
  }, [tenantSlug, open, messages]);

  const statusQuery = trpc.assistant.status.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
  });

  const chatMutation = trpc.assistant.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err.message}` },
      ]);
    },
  });

  const handleSend = (content: string) => {
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    chatMutation.mutate({
      messages: next
        .filter((m): m is typeof m & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content })),
      page: {
        path: page.path,
        label: page.label,
        breadcrumb: page.breadcrumb,
        screenKind: screenForPage?.kind,
        screenTitle: screenForPage?.title,
        screenSummary: screenForPage?.summary,
      },
    });
  };

  const handleClear = () => {
    setMessages([]);
    clearAssistantSession(tenantSlug);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      saveAssistantSession(tenantSlug, { open: false, messages });
    }
  };

  return (
    <>
      {/* جنب القائمة مش فوق الجدول — يمين الشاشة مع مراعاة عرض السايدبار */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-3 text-white shadow-lg ring-1 ring-white/10 hover:bg-slate-800 hover:shadow-xl transition-all md:right-[17.5rem] print:hidden"
        aria-label={`مساعد Easy Cash — ${page.label}`}
        title={`مساعد: ${page.label}`}
      >
        <Sparkles size={18} className="text-sky-300" />
        <span className="hidden max-w-[9rem] truncate text-xs font-medium sm:inline">
          {page.label}
        </span>
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col gap-0" dir="rtl">
          <SheetHeader className="p-4 border-b bg-slate-50 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="text-sky-600" size={18} />
                مساعد Easy Cash
              </SheetTitle>
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-slate-500"
                  onClick={handleClear}
                >
                  <Trash2 size={14} className="ml-1" />
                  مسح
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Badge variant="secondary" className="max-w-full truncate text-[11px] font-normal">
                أنت في: {page.label}
              </Badge>
              {screenForPage ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                  شايف أرقام الشاشة
                </Badge>
              ) : null}
              {statusQuery.data && (
                <>
                  {!statusQuery.data.tenantLinked && (
                    <Badge variant="destructive" className="text-[10px]">
                      غير مربوط بشركة
                    </Badge>
                  )}
                  <Badge variant={statusQuery.data.online ? "default" : "secondary"} className="text-[10px]">
                    {statusQuery.data.online ? "متصل" : "غير متصل"}
                  </Badge>
                </>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 min-h-0 p-3">
            <AIChatBox
              className="flex-1 border-0 shadow-none rounded-none h-full bg-transparent"
              height="100%"
              messages={messages}
              onSendMessage={handleSend}
              isLoading={chatMutation.isPending}
              placeholder={
                screenForPage
                  ? `اسأل عن أرقام «${screenForPage.title}»...`
                  : `اسأل عن «${page.label}»...`
              }
              emptyStateMessage={assistantGreeting(page, Boolean(screenForPage))}
              suggestedPrompts={page.suggestions}
              renderAssistantContent={(message) => (
                <AssistantMessageContent content={message.content} tenantSlug={tenantSlug} />
              )}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
