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
        answerUiReview: 'answer-ui-review.html',
      },
    },
  },
});
