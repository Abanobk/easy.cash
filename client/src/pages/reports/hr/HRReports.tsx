import { Users } from "lucide-react";
import ReportHub from "../shared/ReportHub";
import { HR_REPORTS } from "@/config/report-sections";

export default function HRReports() {
  return (
    <ReportHub
      title="تقارير شئون الموظفين"
      section="hr"
      icon={<Users size={14} />}
      reports={HR_REPORTS}
      procedure="hrBySlug"
    />
  );
}
