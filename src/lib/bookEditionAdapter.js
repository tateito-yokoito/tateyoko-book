import { createBookEdition, selectedBookText } from "./bookEdition.js";
import { photoBookLayout } from "./bookPhotoLayout.js";
import { resolveBookTheme } from "./bookTheme.js";

// The same normalized edition feeds the editing preview and every PDF export.
export function editionFromBookWork({
  title, subtitle, subjectName, footerText, answers = [], questionForAnswer,
  mediaByAnswerId = {}, contributions = [], webBookUrl = null, mode = "draft", includeWebBookQr = true
}) {
  return createBookEdition({
    title, subtitle, subjectName, footerText, webBookUrl, mode, includeWebBookQr, contributions,
    stories: answers.map(answer => {
      const media = mediaByAnswerId[answer.id] || [];
      const question = questionForAnswer(answer) || {};
      const theme = resolveBookTheme(question, answer);
      return {
        id: answer.id,
        sourceUserQuestionId: answer.user_question_id || question.user_question_id || "",
        question: question.content || answer.question_text || "",
        ...theme,
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
