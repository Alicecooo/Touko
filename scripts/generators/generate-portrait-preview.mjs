import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const characters = [["nocturne", "夜澄"], ["ember", "绯音"], ["sage", "知秋"]];
const expressions = [["idle", "平静"], ["happy", "开心"], ["shy", "害羞"], ["thinking", "思考"], ["working", "专注"], ["sleeping", "困倦"]];
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="765"><rect width="1300" height="765" fill="#171a23"/>'];
const text = (x, y, label, size = 18, fill = "#e9e7e2", anchor = "start") => parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="Microsoft YaHei, sans-serif">${label}</text>`);
text(32, 45, "Touko · 角色与表情", 26);
text(32, 76, "3 位角色 · 6 种表情 · 害羞版不含脸红", 14, "#aaaebd");
expressions.forEach(([, label], col) => text(208 + col * 184, 120, label, 16, "#c9cbd3", "middle"));
characters.forEach(([id, label], row) => {
  const y = 143 + row * 195;
  text(32, y + 88, label, 20);
  expressions.forEach(([expression], col) => {
    const x = 120 + col * 184;
    const bytes = readFileSync(resolve(root, `public/portraits/touko-portrait-v1-${id}-${expression}.png`));
    const clip = `clip-${row}-${col}`;
    parts.push(`<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="176" height="176" rx="22"/></clipPath></defs>`);
    parts.push(`<image x="${x}" y="${y}" width="176" height="176" clip-path="url(#${clip})" href="data:image/png;base64,${bytes.toString("base64")}"/>`);
  });
});
parts.push("</svg>");
writeFileSync(resolve(root, "build/portrait-preview.png"), new Resvg(parts.join("")).render().asPng());
console.log("Wrote build/portrait-preview.png");
