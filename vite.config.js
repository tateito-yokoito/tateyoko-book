import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "/",
  build: {
    rollupOptions: {
      input: mode === 'hp-preview' ? { hpPreview: 'hp-nov8-full-preview.html' } : {
        app: 'index.html',
        giftThreeQuestions: 'gift-three-questions.html',
        supportConsultation: 'support-consultation/index.html',
        generalInquiry: 'contact/index.html',
        earlyAccess: 'early-access/index.html',
        ...(process.env.RELEASE_EXCLUDE_REVIEW_ENTRY === 'true' ? {} : { answerUiReview: 'answer-ui-review.html' }),
        ...(process.env.RELEASE_FAMILY_HOME_REVIEW === 'true' ? {
          familyHomeReview: 'family-home-review.html',
          familyHomeComparison: 'family-home-comparison.html',
          familyPersonReview: 'family-person-review.html',
          familyPersonComparison: 'family-person-comparison.html',
          familyPlaceMobile: 'family-place-mobile.html',
        } : {}),
      },
    },
  },
}));
