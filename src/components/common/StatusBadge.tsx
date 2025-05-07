
import { Badge } from "@/components/ui/badge";

type StatusType = "processing" | "ready" | "running" | "completed" | "failed" | "error";

interface StatusBadgeProps {
  status: StatusType;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusProps = () => {
    switch (status) {
      case "processing":
        return {
          className: "bg-warning text-warning-foreground",
          label: "Processing",
          animated: true
        };
      case "ready":
        return {
          className: "badge-success",
          label: "Ready",
          animated: false
        };
      case "running":
        return {
          className: "bg-info text-info-foreground",
          label: "Running",
          animated: true
        };
      case "completed":
        return {
          className: "badge-success",
          label: "Completed",
          animated: false
        };
      case "failed":
        return {
          className: "badge-destructive",
          label: "Failed",
          animated: false
        };
      case "error":
        return {
          className: "badge-destructive",
          label: "Error",
          animated: false
        };
      default:
        return {
          className: "bg-muted text-muted-foreground",
          label: status,
          animated: false
        };
    }
  };

  const { className, label, animated } = getStatusProps();

  return (
    <Badge className={`${className} ${animated ? "animate-pulse-subtle" : ""}`}>
      {label}
    </Badge>
  );
}
