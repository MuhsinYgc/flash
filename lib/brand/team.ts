export const TEAM = {
  fullName: "Kahramanmaraş Büyükşehir Belediyesi Kipaş İstiklal Spor",
  shortName: "Kipaş İstiklal Basket",
  city: "Kahramanmaraş",
  league: "TBL",
  mascot: "EDE",
  instagram: "@kipas.istiklalbasketbol",
  tagline: "Tribün birlikte yanıyor",
} as const;

export const TEAM_COLORS = {
  red: "#ED1C24",
  redDark: "#B51218",
  cyan: "#00ADEF",
  white: "#FFFFFF",
  ink: "#141820",
  muted: "#5C6675",
  surface: "#F7F8FA",
  border: "#D6E8F2",
} as const;

export const QR_COLORS = {
  dark: TEAM_COLORS.redDark,
  light: TEAM_COLORS.white,
} as const;
