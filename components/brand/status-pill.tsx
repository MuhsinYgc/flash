import type { ReactNode } from "react";

type StatusPillProps = {
  active: boolean;
  label: string;
  icon?: ReactNode;
};

export function StatusPill({ active, label, icon }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
        active
          ? "bg-team-red/10 text-team-red ring-1 ring-team-red/20"
          : "bg-team-white text-team-muted ring-1 ring-team-border"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
