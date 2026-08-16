import { BookOpen } from "lucide-react";
import ReportHub from "../shared/ReportHub";
import { ACCOUNTING_REPORTS } from "@/config/report-sections";

export default function AccountingReports() {
  return (
    <ReportHub
      title="تقارير الحسابات"
      section="accounting"
      icon={<BookOpen size={14} />}
      reports={ACCOUNTING_REPORTS}
      procedure="accountingBySlug"
    />
  );
}
