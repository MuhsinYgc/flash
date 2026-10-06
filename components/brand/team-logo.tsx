import Image from "next/image";

type TeamLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function TeamLogo({ size = 48, className = "", priority = false }: TeamLogoProps) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Kipaş İstiklal Spor"
      width={size}
      height={size}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
