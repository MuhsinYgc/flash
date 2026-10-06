import { TEAM } from "@/lib/brand/team";
import { TeamLogo } from "./team-logo";

type TeamHeaderProps = {
  subtitle?: string;
  align?: "left" | "center";
  logoSize?: number;
  tone?: "dark" | "light";
  className?: string;
};

export function TeamHeader({
  subtitle,
  align = "left",
  logoSize = 56,
  tone = "dark",
  className = "",
}: TeamHeaderProps) {
  const centered = align === "center";
  const light = tone === "light";

  return (
    <header
      className={`flex items-center gap-4 ${centered ? "flex-col text-center" : ""} ${className}`}
    >
      <TeamLogo size={logoSize} priority className="shrink-0 drop-shadow-sm" />
      <div className={`min-w-0 ${centered ? "text-center" : ""}`}>
        <p
          className={`font-display text-[11px] font-semibold uppercase tracking-[0.24em] ${
            light ? "text-white/80" : "text-team-cyan"
          }`}
        >
          {TEAM.city} · {TEAM.league}
        </p>
        <h1
          className={`mt-1 font-display text-xl font-bold uppercase leading-tight tracking-wide sm:text-2xl ${
            light ? "text-white" : "text-team-ink"
          }`}
        >
          {TEAM.shortName}
        </h1>
        {subtitle ? (
          <p className={`mt-1 text-sm font-medium ${light ? "text-white/85" : "text-team-muted"}`}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
