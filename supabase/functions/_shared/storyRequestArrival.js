export function storyRequestHomeUrl(appUrl) {
  const url = new URL(appUrl || 'https://www.tateito-yokoito.jp/');
  url.pathname = '/';
  url.search = '?app=1';
  url.hash = '';
  return url.toString();
}

export function storyRequestArrivalText(homeUrl) {
  return `【縦糸横糸】\n大切な方からの語りが届きました。\n回答はホームでご確認ください。\n${homeUrl}`;
}
