import { useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import TenantLoginLinkButton from "@/components/TenantLoginLinkButton";
import TenantLoginQrDialog from "@/components/TenantLoginQrDialog";

type Props = {
  slug: string;
  companyName: string;
  copyVariant?: "default" | "outline" | "ghost";
  copyClassName?: string;
  layout?: "row" | "column";
};

export default function TenantLoginShareActions({
  slug,
  companyName,
  copyVariant = "ghost",
  copyClassName = "",
  layout = "row",
}: Props) {
  const [qrOpen, setQrOpen] = useState(false);
  const flexClass = layout === "column" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-1";

  return (
    <>
      <div className={flexClass}>
        <TenantLoginLinkButton
          slug={slug}
          companyName={companyName}
          variant={copyVariant}
          className={copyClassName}
        />
        <Button
          type="button"
          variant={copyVariant}
          size="sm"
          className={`gap-1.5 text-xs text-violet-700 hover:bg-violet-50 ${copyClassName}`}
          onClick={() => setQrOpen(true)}
        >
          <QrCode size={13} />
          QR — {companyName}
        </Button>
      </div>
      <TenantLoginQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        slug={slug}
        companyName={companyName}
      />
    </>
  );
}
