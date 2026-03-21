import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  nuova: { label: "Nuova", className: "status-nuova" },
  offerta_inviata: { label: "Offerta Inviata", className: "status-offerta" },
  caparra_inviata: { label: "Caparra Inviata", className: "status-caparra" },
  confermata: { label: "Confermata", className: "status-confermata" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", config.className)}>
      {config.label}
    </Badge>
  );
}
