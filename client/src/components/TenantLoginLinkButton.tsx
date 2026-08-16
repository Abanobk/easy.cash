import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyTenantLoginLink } from "@/lib/tenant-login";

type Props = {
  slug: string;
  companyName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
};

export default function TenantLoginLinkButton({
  slug,
  companyName,
  variant = "ghost",
  size = "sm",
  className = "",
}: Props) {
  const label = companyName ? `نسخ الرابط — ${companyName}` : "نسخ رابط الدخول";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={`gap-1.5 text-xs ${className}`}
      onClick={async () => {
        try {
          const url = await copyTenantLoginLink(slug, companyName);
          toast.success(`تم نسخ رابط دخول ${companyName}`, {
            description: url,
          });
        } catch {
          toast.error("تعذر نسخ الرابط");
        }
      }}
    >
      <Link2 size={13} />
      {label}
    </Button>
  );
}
