import { useEffect, useState } from "react";
import type { MausColor } from "@/lib/bot-appearance";
import { normalizeState } from "@/lib/bot-appearance";
import { avatarCropRadius, botAvatarProfile, clampAvatarFocus, clampAvatarZoom, type BotAvatarCrop } from "../../shared/bot-avatar";
import { defaultPortraitCharacter, portraitAvatarUrl, portraitFromAvatarUrl, type PortraitCharacter, type PortraitExpression } from "../../shared/portrait-avatars";

export type BotAvatarProps = {
  size?: number;
  label?: string;
  bot: {
    id?: string; busy?: boolean; name?: string; color: MausColor;
    avatarUrl?: string | null; avatarCrop?: BotAvatarCrop;
    avatarZoom?: number; avatarFocusX?: number; avatarFocusY?: number;
    mascotExpression?: string | null;
  };
};

export function BotAvatar({ bot, size = 44, label }: BotAvatarProps) {
  const profile = botAvatarProfile(bot);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [profile.avatarUrl]);


  const portrait = portraitFromAvatarUrl(profile.avatarUrl);
  if (portrait || !profile.avatarUrl || imageFailed) {
    return <PortraitAvatar
      character={portrait?.character ?? defaultPortraitCharacter(bot.id || bot.name || bot.color)}
      expression={normalizeState(bot.mascotExpression) ?? portrait?.expression ?? "idle"}
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

export function PortraitAvatar({ character, expression = "idle", size = 44, label = "Bot" }: {
  character: PortraitCharacter;
  expression?: PortraitExpression;
  size?: number;
  label?: string;
}) {
  const source = portraitAvatarUrl(character, expression);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [neutralFailed, setNeutralFailed] = useState(false);
  useEffect(() => { setFailedSource(null); setNeutralFailed(false); }, [character]);
  if (neutralFailed) return <InitialsAvatar initials={label.slice(0, 1)} size={size} />;
  const shown = failedSource === source ? portraitAvatarUrl(character) : source;
  return <span className="relative inline-block shrink-0 overflow-hidden rounded-[22%] bg-raised" style={{ width: size, height: size }}>
    <img src={shown} alt={label} width={size} height={size} draggable={false}
      className="block size-full object-cover"
      onError={() => { if (shown === portraitAvatarUrl(character)) setNeutralFailed(true); else setFailedSource(source); }} />
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
