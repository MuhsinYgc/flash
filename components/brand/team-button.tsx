import type { ButtonHTMLAttributes, ReactNode } from "react";

type TeamButtonVariant = "primary" | "secondary" | "ghost" | "icon";

type TeamButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: TeamButtonVariant;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
};

const variantClass: Record<TeamButtonVariant, string> = {
  primary:
    "bg-team-red text-white shadow-sm shadow-team-red/25 hover:bg-team-red-dark disabled:bg-team-red/50",
  secondary:
    "border border-team-border bg-team-white text-team-ink shadow-sm hover:border-team-cyan/60 hover:bg-team-cyan/5",
  ghost:
    "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur-sm hover:bg-white/20",
  icon:
    "border border-team-border bg-team-white text-team-ink hover:border-team-red/40 hover:bg-team-red/5 disabled:opacity-40",
};

export function TeamButton({
  variant = "primary",
  icon,
  children,
  className = "",
  type = "button",
  ...props
}: TeamButtonProps) {
  const iconOnly = variant === "icon";
  return (
    <button
      type={type}
      className={`inline-flex touch-manipulation items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        iconOnly ? "h-9 w-9 p-0" : "min-h-11 px-4 py-2.5 text-sm"
      } ${variantClass[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
