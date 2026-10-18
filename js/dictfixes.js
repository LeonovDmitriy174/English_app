// dictfixes.js — исправления к словарю, которые накладываются при загрузке поверх data/dict.json.
// Словарь собирается из Викисловаря автоматически, и у самых частых слов там бывают неудачные переводы:
// у the нет перевода, у a первым стоит перевод буквы, у would склеены обрывки примеров. Исправления лежат здесь, а не в dict.json,
// потому что переживают пересборку словаря. Чистые функции без DOM (tests/dictfixes.test.mjs).

/**
 * Слово → поля записи, которые надо заменить. Отобраны по частоте в книгах (A Game of Thrones, Harry Potter) и проверены вручную:
 * в сумме эти слова дают 15–16% всех слов текста (измерено на A Game of Thrones и Harry Potter). Остальные поля записи остаются из словаря.
 */
export const FIXES = {
  the: {
    ru: "определённый артикль (по-русски не переводится: указывает на конкретный, уже известный предмет)",
    en: "The definite article: points to a specific thing that speaker and listener both know",
  },
  a: {
    ru: "неопределённый артикль (по-русски не переводится): один, какой-то",
    en: "The indefinite article, before a consonant sound: one, any (a book)",
  },
  an: {
    ru: "неопределённый артикль (по-русски не переводится): один, какой-то",
    en: "The indefinite article, before a vowel sound: one, any (an apple)",
  },
  i: { ru: "я", en: "The pronoun of the first person: the speaker or writer" },
  it: { ru: "он, она, оно (о предмете или животном); это; в безличных предложениях не переводится (it rains — идёт дождь)" },
  to: { ru: "к, в, на, до (направление); чтобы; частица перед глаголом (to go — идти)" },
  on: { ru: "на, по (на поверхности); в (on Monday — в понедельник); о, про; включённый" },
  as: { ru: "как, в качестве; когда; так как; по мере того как; as … as — такой же … как" },
  do: { ru: "делать, сделать; вспомогательный глагол в вопросах и отрицаниях (Do you know? — Ты знаешь?)" },
  have: { ru: "иметь, обладать (у меня есть); вспомогательный глагол (I have seen — я видел)" },
  will: { ru: "вспомогательный глагол будущего времени (I will go — я пойду); хотеть, желать; воля; завещание" },
  would: {
    ru: "бы (I would go — я бы пошёл); обычно, бывало (о прошлом); будущее в прошедшем (he said he would come — он сказал, что придёт)",
    en: "Used for the conditional, for past habits, and for the future seen from the past",
  },
  could: { ru: "мог, умел (прошедшее от can); мог бы (could you help? — не могли бы вы помочь?)", en: "Past tense and conditional of can" },
  might: { ru: "мог бы, возможно (о вероятности: it might rain — может пойти дождь); сила, мощь" },
  just: { ru: "только что; просто, как раз; всего лишь; справедливый, правильный" },
  even: { ru: "даже (even he — даже он); ещё (even more — ещё больше); ровный, гладкий; чётный" },
  no: { ru: "нет; не, никакой (no money — нет денег)" },
  grey: { ru: "серый, седой; пасмурный", en: "Of a color between black and white (British spelling of gray)" },
  according: { ru: "согласно, в соответствии с (according to …: по словам, по данным)", en: "As stated by; in agreement with (according to)" },
};

const ENTITY = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " };

/** Заменяет HTML-сущности (&lt;, &quot;) на сами знаки: в словаре они попали из разметки Викисловаря. */
export const decodeEntities = (s) => (typeof s === "string" && s.includes("&") ? s.replace(/&(?:lt|gt|amp|quot|apos|nbsp|#39);/g, (m) => ENTITY[m]) : s);

const TEXT_FIELDS = ["ru", "rm", "en", "ex"];

/** Запись словаря после очистки и исправлений: копия, если что-то изменилось, иначе та же запись. */
export function fixEntry(e) {
  let out = e;
  for (const k of TEXT_FIELDS) {
    const v = decodeEntities(e[k]);
    if (v !== e[k]) out = { ...out, [k]: v };
  }
  const fix = e.t === "w" ? Object.hasOwn(FIXES, e.w) && FIXES[e.w] : null;
  return fix ? { ...out, ...fix } : out;
}
