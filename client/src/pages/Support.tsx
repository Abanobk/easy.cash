import { useState } from "react";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  LifeBuoy, Plus, MessageSquare, Clock, CheckCircle2,
  AlertCircle, XCircle, ChevronDown, ChevronUp, Send
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: "مفتوحة", color: "bg-blue-100 text-blue-700", icon: AlertCircle },
  in_progress: { label: "قيد المعالجة", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  resolved: { label: "تم الحل", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  closed: { label: "مغلقة", color: "bg-gray-100 text-gray-600", icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "منخفضة", color: "bg-gray-100 text-gray-600" },
  medium: { label: "متوسطة", color: "bg-blue-100 text-blue-700" },
  high: { label: "عالية", color: "bg-orange-100 text-orange-700" },
  urgent: { label: "عاجلة", color: "bg-red-100 text-red-700" },
};

export default function Support() {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: "", message: "", priority: "medium" });

  const ticketsQuery = trpc.saas.myTickets.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.saas.createTicket.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال طلب الدعم بنجاح! سنرد عليك في أقرب وقت.");
      setForm({ subject: "", message: "", priority: "medium" });
      setShowForm(false);
      utils.saas.myTickets.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    createMutation.mutate({
      subject: form.subject,
      message: form.message,
      priority: form.priority as any,
    });
  };

  const tickets = (ticketsQuery.data || []) as any[];

  return (
    <ERPLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <LifeBuoy size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">الدعم الفني</h1>
              <p className="text-sm text-gray-500">أرسل طلب دعم وسنرد عليك في أقرب وقت</p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Plus size={16} />
            طلب دعم جديد
          </Button>
        </div>

        {/* New Ticket Form */}
        {showForm && (
          <Card className="mb-6 border-blue-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-blue-700 flex items-center gap-2">
                <MessageSquare size={16} />
                إرسال طلب دعم جديد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">الموضوع *</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="وصف مختصر للمشكلة أو الاستفسار..."
                    className="h-10 border-gray-200"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">الأولوية</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="h-10 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">منخفضة</SelectItem>
                      <SelectItem value="medium">متوسطة</SelectItem>
                      <SelectItem value="high">عالية</SelectItem>
                      <SelectItem value="urgent">عاجلة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1.5 block">تفاصيل المشكلة *</Label>
                  <Textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="اشرح المشكلة بالتفصيل، وأذكر الخطوات التي أدت إليها..."
                    rows={5}
                    className="border-gray-200 resize-none"
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    {createMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : <Send size={14} />}
                    إرسال الطلب
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tickets List */}
        {ticketsQuery.isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <LifeBuoy size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">لا توجد طلبات دعم بعد</p>
            <p className="text-gray-400 text-sm mt-1">اضغط "طلب دعم جديد" لإرسال استفسارك</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket: any) => {
              const sc = statusConfig[ticket.status] || statusConfig.open;
              const pc = priorityConfig[ticket.priority] || priorityConfig.medium;
              const StatusIcon = sc.icon;
              const isExpanded = expandedId === ticket.id;

              return (
                <Card key={ticket.id} className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sc.color}`}>
                          <StatusIcon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm truncate">{ticket.subject}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(ticket.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pc.color}`}>{pc.label}</span>
                        {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1 font-medium">رسالتك:</div>
                        <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">{ticket.message}</div>
                      </div>
                      {ticket.adminReply && (
                        <div>
                          <div className="text-xs text-blue-600 mb-1 font-medium flex items-center gap-1">
                            <MessageSquare size={11} /> رد فريق الدعم:
                          </div>
                          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg p-3 leading-relaxed">
                            {ticket.adminReply}
                          </div>
                          {ticket.repliedAt && (
                            <div className="text-xs text-gray-400 mt-1">
                              تم الرد في: {new Date(ticket.repliedAt).toLocaleDateString("ar-EG")}
                            </div>
                          )}
                        </div>
                      )}
                      {!ticket.adminReply && (
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg p-2">
                          <Clock size={11} className="text-amber-500" />
                          في انتظار رد فريق الدعم...
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Contact Info */}
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
          <h3 className="font-semibold text-blue-800 mb-3 text-sm">طرق التواصل الأخرى</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl p-3 border border-blue-100 text-center">
              <div className="text-lg mb-1">📞</div>
              <div className="text-xs font-medium text-gray-700">هاتف الدعم</div>
              <div className="text-xs text-blue-600 font-mono mt-0.5">01000000000</div>
            </div>
            <div className="bg-white rounded-xl p-3 border border-blue-100 text-center">
              <div className="text-lg mb-1">✉️</div>
              <div className="text-xs font-medium text-gray-700">البريد الإلكتروني</div>
              <div className="text-xs text-blue-600 font-mono mt-0.5">support@easycash.app</div>
            </div>
            <div className="bg-white rounded-xl p-3 border border-blue-100 text-center">
              <div className="text-lg mb-1">💬</div>
              <div className="text-xs font-medium text-gray-700">واتساب</div>
              <div className="text-xs text-blue-600 font-mono mt-0.5">01000000000</div>
            </div>
          </div>
        </div>
      </div>
    </ERPLayout>
  );
}
