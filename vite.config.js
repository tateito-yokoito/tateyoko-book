import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    rollupOptions: {
      input: {
        app: 'index.html',
        giftThreeQuestions: 'gift-three-questions.html',
        supportConsultation: 'support-consultation/index.html',
        generalInquiry: 'contact/index.html',
        ...(process.env.RELEASE_EXCLUDE_REVIEW_ENTRY === 'true' ? {} : { answerUiReview: 'answer-ui-review.html' }),
      },
    },
  },
});
