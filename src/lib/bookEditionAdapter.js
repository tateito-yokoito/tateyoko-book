import { createBookEdition, selectedBookText } from "./bookEdition.js";
import { photoBookLayout } from "./bookPhotoLayout.js";
import { STORY_THEMES } from "./storyThemes.js";

// The same normalized edition feeds the editing preview and every PDF export.
export function editionFromBookWork({
  title, subtitle, subjectName, footerText, answers = [], questionForAnswer,
  mediaByAnswerId = {}, webBookUrl = null, mode = "draft", includeWebBookQr = true
}) {
  return createBookEdition({
    title, subtitle, subjectName, footerText, webBookUrl, mode, includeWebBookQr,
    stories: answers.map(answer => {
      const media = mediaByAnswerId[answer.id] || [];
      const question = questionForAnswer(answer) || {};
      const themeCode = question.theme_code || question.meta_json?.theme_code || answer.meta_json?.theme_code || "";
      const themeHint = question.theme_label || question.meta_json?.theme_label || question.chapter_label || "";
      const theme = STORY_THEMES.find(item => item.code === themeCode)
        || STORY_THEMES.find(item => item.label === themeHint || item.order === 1 && themeHint === "幼い頃");
      return {
        id: answer.id,
        question: question.content || answer.question_text || "",
        themeCode: theme?.code || "",
        themeLabel: theme?.label || "",
        themeOrder: theme?.order || null,
        body: selectedBookText(answer),
        photos: media.filter(item => item.asset_type === "photo" && item.url).map((item, index) => ({
          id: item.id,
          url: item.url,
          caption: item.caption || item.meta_json?.caption || "",
          bookLayout: photoBookLayout(item, index)
        })).filter(item => item.bookLayout.placement !== "excluded")
      };
    }).filter(story => story.body)
  });
}
