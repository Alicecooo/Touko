import { useEffect, useState } from "react";
import type { MausColor } from "@/lib/bot-appearance";
import { MAUS_COLORS, normalizeState, type MausState } from "@/lib/mascot";
import { avatarCropRadius, botAvatarProfile, clampAvatarFocus, clampAvatarZoom, type BotAvatarCrop } from "../../shared/bot-avatar";
import { portraitFromAvatarUrl } from "../../shared/portrait-avatars";
import { botMascotBody, MASCOT_BODIES, type MascotBodyId } from "../../shared/mascot-bodies";
import { CursorAvatar } from "./CursorAvatar";

export type BotAvatarProps = {
  size?: number;
  label?: string;
  bot: {
    id?: string; busy?: boolean; name?: string; color: MausColor;
    avatarUrl?: string | null; avatarCrop?: BotAvatarCrop;
    avatarZoom?: number; avatarFocusX?: number; avatarFocusY?: number;
    mascotExpression?: string | null;
    mascotBody?: MascotBodyId | null;
  };
};

export function BotAvatar({ bot, size = 44, label }: BotAvatarProps) {
  const profile = botAvatarProfile(bot);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);


  if (portraitFromAvatarUrl(profile.avatarUrl) || !profile.avatarUrl || imageFailed) {
    return <MausAvatar
      color={bot.color}
      bodyId={bot.mascotBody ?? undefined}
      state={normalizeState(bot.mascotExpression) ?? (bot.busy ? "working" : "idle")}
      size={size}
      label={label ?? bot.name ?? "Bot"}
    />;
  }

  const radius = avatarCropRadius(profile.avatarCrop);
  const zoom = clampAvatarZoom(bot.avatarZoom ?? 1);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? 0.5);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? 0.5);
  const origin = `${focusX * 100}% ${focusY * 100}%`;
  return (
    <span
      className="relative block shrink-0 overflow-hidden bg-raised"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img
        src={profile.avatarUrl}
        alt={label ?? (bot.name ? `${bot.name} avatar` : "Bot avatar")}
        width={size}
        height={size}
        draggable={false}
        onError={() => setImageFailed(true)}
        className="block size-full max-w-none object-cover"
        style={{
          width: size,
          height: size,
          objectPosition: origin,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: origin,
        }}
      />
    </span>
  );
}

function mixColor(hex: string, toward: string, amount: number): string {
  const first = Number.parseInt(hex.slice(1), 16);
  const second = Number.parseInt(toward.slice(1), 16);
  return `#${[16, 8, 0].map(shift => Math.round(((first >> shift) & 255) * (1 - amount) + ((second >> shift) & 255) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function MausAvatar({ color, bodyId, state = "idle", size = 44, label = "Bot", animated = true }: {
  color: MausColor;
  bodyId?: MascotBodyId;
  state?: MausState;
  size?: number;
  label?: string;
  animated?: boolean;
}) {
  const fill = MAUS_COLORS[color] ?? MAUS_COLORS.green;
  return <span className="inline-flex shrink-0" style={{ width: size, height: size }}>
    <CursorAvatar state={state} size={size} title={label} silhouette={MASCOT_BODIES[botMascotBody(bodyId)]}
      gradient={[mixColor(fill, "#ffffff", 0.55), fill, mixColor(fill, "#000000", 0.42)]} lookAround={0}
      paused={!animated} effects={animated} glyphs={animated} autoBlink={animated} />
  </span>;
}

export function InitialsAvatar({
  initials,
  size = 32,
}: {
  initials: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-raised text-ink-secondary font-medium"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
