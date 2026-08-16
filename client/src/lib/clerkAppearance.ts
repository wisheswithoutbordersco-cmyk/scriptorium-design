import type { ClerkProviderProps } from "@clerk/react";

/**
 * Brand skin for every Clerk-rendered surface (sign-in, sign-up, user button).
 * Mirrors the ultra-black + sapphire palette defined in `client/src/index.css`
 * so the hosted components do not look bolted on.
 */
export const clerkAppearance: ClerkProviderProps["appearance"] = {
  variables: {
    colorPrimary: "#1e6fff",
    colorBackground: "#0a0a0a",
    colorInput: "#101215",
    colorInputForeground: "#f4f7ff",
    colorBorder: "#1f242c",
    colorMuted: "#101215",
    colorForeground: "#f4f7ff",
    colorMutedForeground: "#8d97ab",
    colorDanger: "#ff5f6d",
    colorSuccess: "#3ddc97",
    colorRing: "#1e6fff",
    borderRadius: "0.65rem",
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  elements: {
    rootBox: "w-full",
    cardBox:
      "border border-white/10 bg-[#0d0f13]/95 shadow-[0_28px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl",
    card: "bg-transparent",
    headerTitle: "text-white tracking-[-0.03em]",
    headerSubtitle: "text-white/55",
    socialButtonsBlockButton:
      "border-white/12 bg-white/[0.03] text-white hover:border-[#1e6fff]/60 hover:bg-[#1e6fff]/10",
    dividerLine: "bg-white/10",
    dividerText: "text-white/40",
    formFieldLabel: "text-white/70",
    formFieldInput:
      "border-white/12 bg-black/40 text-white placeholder:text-white/30 focus:border-[#1e6fff]",
    formButtonPrimary:
      "bg-gradient-to-r from-[#1e6fff] to-[#0047cc] text-white font-semibold shadow-[0_10px_30px_rgba(30,111,255,0.35)] hover:brightness-110",
    footerActionText: "text-white/50",
    footerActionLink: "text-[#5c92ff] hover:text-[#8ab2ff]",
    identityPreview: "border-white/10 bg-white/[0.03]",
    userButtonPopoverCard:
      "border border-white/10 bg-[#0d0f13] shadow-[0_28px_80px_rgba(0,0,0,0.65)]",
    userButtonPopoverActionButton: "text-white/75 hover:bg-white/[0.06]",
  },
};
