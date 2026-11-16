// The public launch gate is closed in production. TEST keeps the real purchase journey.
export const isPublicTest = import.meta.env.VITE_PUBLIC_TEST_MODE === 'true';
export const publicPurchaseHref = isPublicTest ? '/?app=1&entry=purchase' : '/early-access/';
export const publicPurchaseLabel = isPublicTest ? '商品を選んで購入する' : '先行案内を受け取る';
export const publicPurchaseNote = isPublicTest
  ? '商品と料金を確認してから、お申し込みいただけます。'
  : '正式リリース時に、優先してご案内します。';
