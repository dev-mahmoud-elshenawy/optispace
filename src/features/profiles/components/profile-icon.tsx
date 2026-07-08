import { Globe, Link2, Mail, type LucideIcon } from "lucide-react";
import type { IconType } from "react-icons";
import { SiGithub, SiX, SiMedium, SiNpm, SiDart } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa6";

import type { ProfileIconKey } from "@/features/profiles/schema";

// Real brand marks (react-icons / simple-icons) rendered in currentColor so they
// adapt to light/dark. Non-brand keys use lucide glyphs, matching prior behaviour.
const BRAND_ICONS: Partial<Record<ProfileIconKey, IconType>> = {
  github: SiGithub,
  linkedin: FaLinkedin,
  x: SiX,
  medium: SiMedium,
  npm: SiNpm,
  pubdev: SiDart,
};

const LUCIDE_ICONS: Partial<Record<ProfileIconKey, LucideIcon>> = {
  globe: Globe,
  mail: Mail,
};

interface ProfileIconProps {
  icon?: string | null;
  className?: string;
}

export function ProfileIcon({ icon, className }: ProfileIconProps) {
  const brandKey = icon && icon in BRAND_ICONS ? (icon as ProfileIconKey) : null;
  if (brandKey) {
    const Brand = BRAND_ICONS[brandKey] as IconType;
    return <Brand className={className} />;
  }
  const Glyph = (icon && LUCIDE_ICONS[icon as ProfileIconKey]) || Link2;
  return <Glyph className={className} />;
}
