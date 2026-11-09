import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatErrorBanner, ChatNotice } from "./ChatErrorBanner";


describe("ChatErrorBanner", () => {
  it("renders nothing when there is no error", () => {
    expect(renderToStaticMarkup(createElement(ChatErrorBanner, { message: null, onDismiss: () => undefined }))).toBe("");
  });

  it("announces the error and offers a dismiss control", () => {
    const onDismiss = vi.fn();
    const markup = renderToStaticMarkup(createElement(ChatErrorBanner, { message: "Clipboard has no image", onDismiss }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Clipboard has no image");
    expect(markup).toContain('aria-label="Dismiss"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain("border-danger/30");
  });

  it("reads a machine's words as one plain line and keeps them under Details", () => {
    const markup = renderToStaticMarkup(createElement(ChatErrorBanner, { message: "502 Bad Gateway", onDismiss: () => undefined }));
    expect(markup).toContain("Something went wrong on the other end. Try again.");
    expect(markup).toContain("<details");
    expect(markup).toContain(">Details</summary>");
    expect(markup).toContain("502 Bad Gateway");
  });

  it("shows a sentence as it is, with nothing to expand", () => {
    const markup = renderToStaticMarkup(createElement(ChatErrorBanner, { message: "Clipboard has no image", onDismiss: () => undefined }));
    expect(markup).not.toContain("<details");
  });
});

describe("ChatNotice", () => {
  const markup = (notice: Parameters<typeof ChatNotice>[0]["notice"]) => renderToStaticMarkup(createElement(ChatNotice, { notice }));

  it("says which reference no longer resolves", () => {
    expect(markup(null)).toBe("");
    expect(markup({ kind: "thread-gone", botName: null })).toContain("That thread is no longer here.");
    expect(markup({ kind: "thread-gone", botName: "Ada" })).toContain("That thread is no longer here. Showing Ada instead.");
    expect(markup({ kind: "bot-gone", botName: null })).toContain("That bot is no longer here.");
    expect(markup({ kind: "bot-gone", botName: null })).toContain('role="status"');
  });

  it("says why a pressed Steer left pictures queued", () => {
    const text = markup({ kind: "steer-images", botName: null });
    expect(text).toContain("Pictures can&#x27;t be steered into this bot&#x27;s running turn. Your message will be sent as the next turn.");
    expect(text).toContain('role="status"');
  });
});
