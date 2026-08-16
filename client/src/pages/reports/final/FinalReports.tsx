import { PieChart } from "lucide-react";
import ReportHub from "../shared/ReportHub";
import { FINAL_REPORTS } from "@/config/report-sections";

export default function FinalReports() {
  return (
    <ReportHub
      title="التقارير الختامية"
      section="final"
      icon={<PieChart size={14} />}
      reports={FINAL_REPORTS}
      procedure="finalBySlug"
    />
  );
}
