import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotAvatar, type BotAvatarProps } from "./Avatar";

const renderBot = (bot: Partial<BotAvatarProps["bot"]>) => renderToStaticMarkup(createElement(BotAvatar, { bot: { color: "green", ...bot } }));

describe("BotAvatar images", () => {
  it("zooms and positions a custom image inside its crop", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle", avatarZoom: 2, avatarFocusX: 0.25, avatarFocusY: 0.75 });
    expect(markup).toContain("scale(2)");
    expect(markup).toContain("25% 75%");
    expect(markup).toContain("border-radius:50%");
  });
  it("shows a custom image without an overlay", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square" });
    expect(markup).toContain('src="/api/attachments/cat.webp"');
    expect(markup).toContain("border-radius:0");
  });
  it("uses a character portrait when there is no custom image", () => {
    expect(renderBot({ id: "bot-1" })).toContain("/api/attachments/touko-portrait-v1-");
  });
});
