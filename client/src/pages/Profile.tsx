import { useState, useEffect } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Profile() {
  const me = trpc.saas.me.useQuery();
  const [form, setForm] = useState({ name: "", phone: "", jobTitle: "" });

  useEffect(() => {
    if (me.data) {
      setForm({
        name: me.data.name || "",
        phone: me.data.phone || "",
        jobTitle: me.data.jobTitle || "",
      });
    }
  }, [me.data]);

  const updateMut = trpc.saas.updateProfile.useMutation({
    onSuccess: () => toast.success("تم حفظ البيانات"),
    onError: (e) => toast.error(e.message),
  });

  return (
    <ERPLayout title="تعديل بياناتي">
      <Card className="max-w-lg mx-auto">
        <CardHeader><CardTitle>الملف الشخصي</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input value={me.data?.email || ""} disabled />
          </div>
          <div>
            <Label>الاسم</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>الهاتف</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>المسمى الوظيفي</Label>
            <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </div>
          <Button
            className="w-full bg-blue-600"
            onClick={() => updateMut.mutate(form)}
            disabled={updateMut.isPending}
          >
            حفظ التغييرات
          </Button>
        </CardContent>
      </Card>
    </ERPLayout>
  );
}
