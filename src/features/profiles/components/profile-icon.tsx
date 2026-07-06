import { AtSign, Boxes, Briefcase, FolderGit2, Globe, Link2, Mail, Package, PenBox, type LucideIcon } from "lucide-react";
import type { ProfileIconKey } from "@/features/profiles/schema";

// lucide-react ships no brand icons, so each key maps to the closest generic glyph.
const ICON_MAP: Record<ProfileIconKey, LucideIcon> = {
  github: FolderGit2,
  linkedin: Briefcase,
  x: AtSign,
  medium: PenBox,
  npm: Package,
  pubdev: Boxes,
  globe: Globe,
  mail: Mail,
};

interface ProfileIconProps {
  icon?: string | null;
  className?: string;
}

export function ProfileIcon({ icon, className }: ProfileIconProps) {
  const Icon = icon && icon in ICON_MAP ? ICON_MAP[icon as ProfileIconKey] : Link2;
  return <Icon className={className} />;
}
