// The public launch gate remains closed in production. TEST HP reviews enter
// the current production purchase journey before selection or authentication.
export const isPublicTest = import.meta.env.VITE_PUBLIC_TEST_MODE === 'true';
export const publicPurchaseHref = isPublicTest
  ? 'https://www.tateito-yokoito.jp/?app=1&entry=purchase'
  : '/early-access/';
export const publicPurchaseLabel = isPublicTest ? '商品を選んで購入する' : '先行案内を受け取る';
export const publicPurchaseNote = isPublicTest
  ? '商品選択から本番サイトで進みます。'
  : '正式リリース時に、優先してご案内します。';
