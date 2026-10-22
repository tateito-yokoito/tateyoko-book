import { createBookEdition, selectedBookText } from "./bookEdition.js";
import { photoBookLayout } from "./bookPhotoLayout.js";

// The same normalized edition feeds the editing preview and every PDF export.
export function editionFromBookWork({
  title, subtitle, subjectName, footerText, answers = [], questionForAnswer,
  mediaByAnswerId = {}, webBookUrl = null, mode = "draft", includeWebBookQr = true
}) {
  return createBookEdition({
    title, subtitle, subjectName, footerText, webBookUrl, mode, includeWebBookQr,
    stories: answers.map(answer => {
      const media = mediaByAnswerId[answer.id] || [];
      return {
        id: answer.id,
        question: questionForAnswer(answer)?.content || answer.question_text || "",
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
