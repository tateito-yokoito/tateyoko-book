export const AGE_OPTIONS = ['40代以下', '50代', '60代', '70代', '80代', '90代以上'];
export const CONSULTATION_FOR_OPTIONS = ['ご自身の人生史について', 'ご家族など、ご自身以外の方の人生史について'];
export const SMARTPHONE_OPTIONS = [
  '日常的に使いこなしている',
  'LINEや写真など、基本的な操作はできる',
  '電話など、限られた操作だけできる',
  'ほとんど使わない・持っていない',
  '分からない',
];
export const CALL_OPTIONS = ['問題なく話せると思う', '家族などが同席すれば話せると思う', '少し不安がある', '分からない'];
export const SELF_CALL_OPTIONS = ['不安はない', '家族などが同席すれば話せる', '少し不安がある', '分からない'];
export const FAMILY_OPTIONS = ['自分が手伝える', 'ほかに手伝える人がいる', '手伝える人はいない', '分からない'];
export const SELF_FAMILY_OPTIONS = ['家族などに手伝ってもらう予定', '手伝ってもらう予定はない', 'まだ分からない'];
export const FAMILY_HELP_OPTIONS = [
  'ご本人と直接会って、スマホ操作や制作を手伝える',
  '離れた場所から、電話やLINEなどでサポートできる',
  '写真の準備や送付などを手伝える',
  '現時点では分からない',
];
export const SELF_FAMILY_HELP_OPTIONS = [
  '直接会って手伝ってもらえる',
  '離れた場所から電話やLINEなどで手伝ってもらえる',
  '写真の準備や送付を手伝ってもらえる',
  '現時点では分からない',
];
export const RELATION_OPTIONS = ['ご本人', '子ども', '孫', '配偶者・パートナー', 'その他のご家族', 'ご友人・知人', 'その他'];
export const CONTACT_METHOD_OPTIONS = ['メール', '電話', 'SMS（ショートメッセージ）', 'どれでもよい'];
export const SUPPORT_SOURCES = ['hp-product', 'after-free-trial', 'product-selection'];

export function isSelfConsultation(values) {
  return values.consultationFor === CONSULTATION_FOR_OPTIONS[0];
}

export function needsFamilyHelp(answer, self = false) {
  return self ? answer === SELF_FAMILY_OPTIONS[0] : answer === FAMILY_OPTIONS[0] || answer === FAMILY_OPTIONS[1];
}

export function getSupportSource(raw) {
  return SUPPORT_SOURCES.includes(raw) ? raw : 'hp-product';
}

export function validateSupportConsultation(values) {
  if (!CONSULTATION_FOR_OPTIONS.includes(values.consultationFor)) return 'Q1の相談対象を選択してください。';
  const self = isSelfConsultation(values);
  if (!AGE_OPTIONS.includes(values.age)) return 'Q2の年代を選択してください。';
  if (!SMARTPHONE_OPTIONS.includes(values.smartphone)) return 'Q3のスマートフォン利用状況を選択してください。';
  if (!(self ? SELF_CALL_OPTIONS : CALL_OPTIONS).includes(values.call)) return 'Q4の通話について選択してください。';
  if (!(self ? SELF_FAMILY_OPTIONS : FAMILY_OPTIONS).includes(values.family)) return 'Q5のサポート体制を選択してください。';
  if (needsFamilyHelp(values.family, self) && (!Array.isArray(values.familyHelp) || !values.familyHelp.length || values.familyHelp.some(answer => !(self ? SELF_FAMILY_HELP_OPTIONS : FAMILY_HELP_OPTIONS).includes(answer)))) return 'Q6のサポート方法を選択してください。';
  if (!String(values.name || '').trim() || String(values.name).trim().length > 200) return 'お名前を入力してください。';
  if (!self && !RELATION_OPTIONS.slice(1).includes(values.relation)) return 'ご本人とのご関係を選択してください。';
  const email = String(values.email || '').trim();
  const phone = String(values.phone || '').trim();
  if (!email && !phone) return 'メールアドレスか電話番号を入力してください。';
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return 'メールアドレスを確認してください。';
  if (values.receiveCopy === true && !email) return '送信内容の控えを受け取るにはメールアドレスを入力してください。';
  if (phone && (phone.length > 30 || !/^[0-9+()\-\s]{8,30}$/.test(phone) || phone.replace(/\D/g, '').length < 8)) return '電話番号を確認してください。';
  if (!CONTACT_METHOD_OPTIONS.includes(values.contactMethod)) return 'ご希望の連絡方法を選択してください。';
  if (values.contactMethod === 'メール' && !email) return 'メールでの連絡にはメールアドレスが必要です。';
  if (['電話', 'SMS（ショートメッセージ）'].includes(values.contactMethod) && !phone) return '電話・SMSでの連絡には電話番号が必要です。';
  if (String(values.message || '').length > 500) return 'その他のご希望は500文字以内で入力してください。';
  if (values.consent !== true) return '個人情報の利用目的をご確認ください。';
  return '';
}

export function consultationReceiptNumber(id, createdAt) {
  const date = new Date(createdAt);
  const day = Number.isNaN(date.getTime()) ? '00000000' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('-', '');
  return `SC-${day}-${String(id || '').replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

export function formatSupportConsultation(values, source) {
  const self = isSelfConsultation(values);
  const lines = [
    '【聞き取り制作サポート・事前相談】',
    `流入元：${getSupportSource(source)}`,
    `Q1 今回のご相談は、どなたの人生史についてですか？：${values.consultationFor}`,
    `Q2 ${self ? 'あなたの年代を教えてください。' : '人生史を制作する方の年代を教えてください。'}：${values.age}`,
    `Q3 ${self ? '普段、スマートフォンをどの程度使っていますか？' : 'その方は、普段どの程度スマートフォンを使っていますか？'}：${values.smartphone}`,
    `Q4 ${self ? '電話やLINE通話でスタッフとお話しすることに不安はありますか？' : 'その方は、電話やLINE通話でスタッフとお話しできそうですか？'}：${values.call}`,
    `Q5 ${self ? '制作を手伝ってもらう予定の方はいらっしゃいますか？' : 'あなたやご家族など、制作を手伝える方はいらっしゃいますか？'}：${values.family}`,
    `Q6 サポート方法：${needsFamilyHelp(values.family, self) ? values.familyHelp.join('／') : '該当なし'}`,
    `Q7 お名前：${String(values.name || '').trim()}`,
    `Q8 ご本人との関係：${self ? 'ご本人' : values.relation}`,
    `Q9 メールアドレス：${String(values.email || '').trim() || '未入力'}`,
    `Q9 電話番号：${String(values.phone || '').trim() || '未入力'}`,
    `Q10 ご希望の連絡方法：${values.contactMethod}`,
    `Q11 その他、ご希望やご質問：${String(values.message || '').trim() || '記入なし'}`,
  ];
  return lines.join('\n');
}
