import { Wrench } from "lucide-react";
import ReportHub from "../shared/ReportHub";
import { ASSETS_REPORTS } from "@/config/report-sections";

export default function AssetsReports() {
  return (
    <ReportHub
      title="تقارير الأصول الثابتة"
      section="assets"
      icon={<Wrench size={14} />}
      reports={ASSETS_REPORTS}
      procedure="assetsBySlug"
    />
  );
}
