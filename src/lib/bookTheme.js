import { STORY_THEMES } from "./storyThemes.js";

// Older questions predate theme_code. Keep their chapter names short on paper
// while retaining a stable fore-edge position within that seven-chapter set.
const legacyChapters = [
  ["生まれ育ちと原点", "幼い頃", 1],
  ["学びと青春", "学生時代", 2],
  ["仕事と担ってきた役割", "仕事・役割", 3],
  ["家族と大切な人", "家族", 4],
  ["転機と心に残る出来事", "人生の転機", 5],
  ["大切にしてきたこと", "大切なこと", 6],
  ["受け継いだもの、伝えたいこと", "伝えたいこと", 7]
];

export function resolveBookTheme(question = {}, answer = {}) {
  const meta = question.meta_json || {};
  const code = question.theme_code || meta.theme_code || answer.meta_json?.theme_code || "";
  const order = Number(question.theme_order ?? meta.theme_order ?? answer.meta_json?.theme_order);
  const hint = String(question.theme_label || meta.theme_label || question.chapter_label
    || question.chapter_title_snapshot || question.chapter || answer.meta_json?.chapter_label || "").trim();
  const current = STORY_THEMES.find(item => item.code === code)
    || STORY_THEMES.find(item => item.label === hint || item.order === 1 && hint === "幼い頃")
    || (Number.isInteger(order) && !code ? STORY_THEMES.find(item => item.order === order) : null);
  if (current) return { themeCode: current.code, themeLabel: current.label, themeOrder: current.order };
  const legacy = legacyChapters.find(([chapter]) => chapter === hint);
  if (legacy) return { themeCode: `legacy-${legacy[2]}`, themeLabel: legacy[1], themeOrder: legacy[2] };
  if (hint === "はじめの会話" || hint === "体験の一頁") {
    return { themeCode: "book-intro", themeLabel: "はじまり", themeOrder: 0 };
  }
  return { themeCode: "", themeLabel: "", themeOrder: null };
}
