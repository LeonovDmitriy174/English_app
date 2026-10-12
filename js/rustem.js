// rustem.js — основа русского слова («красивая» и «красивый» дают одну основу «красив»).
// Это упрощённая запись алгоритма Snowball для русского языка: отрезаются окончания существительных, прилагательных, глаголов,
// причастий и возвратные «ся/сь». Нужна поиску по русскому слову: человек пишет «бежал», а в словаре «бежать».
// Чистая функция без DOM: проверяется в Node (tests/rustem.test.mjs).

const VOWELS = "аеиоуыэюя";
const isVowel = (c) => VOWELS.includes(c);
const AYA = (c) => c === "а" || c === "я";

// Окончания по группам Snowball. «После а/я» значит, что перед окончанием должна стоять «а» или «я».
const PERFECTIVE_A = ["вшись", "вши", "в"]; // после а/я
const PERFECTIVE_B = ["ившись", "ывшись", "ивши", "ывши", "ив", "ыв"];
const REFLEXIVE = ["ся", "сь"];
const ADJECTIVE = ["ими", "ыми", "его", "ого", "ему", "ому", "ее", "ие", "ые", "ое", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом", "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею"];
const PARTICIPLE_A = ["ем", "нн", "вш", "ющ", "щ"]; // после а/я
const PARTICIPLE_B = ["ивш", "ывш", "ующ"];
const VERB_A = ["нно", "ешь", "ете", "йте", "ла", "на", "ли", "ло", "но", "ет", "ют", "ны", "ть", "ем", "й", "л", "н"]; // после а/я
const VERB_B = ["ейте", "уйте", "ила", "ыла", "ена", "ите", "или", "ыли", "ило", "ыло", "ено", "ует", "уют", "ены", "ить", "ыть", "ишь", "ей", "уй", "ил", "ыл", "им", "ым", "ен", "ят", "ит", "ыт", "ую", "ю"];
const NOUN = ["иями", "ями", "ами", "ией", "иям", "ием", "иях", "ие", "ье", "ей", "ой", "ий", "ям", "ем", "ам", "ом", "ах", "ях", "ию", "ью", "ия", "ья", "ев", "ов", "еи", "ии", "ы", "ь", "ю", "я", "а", "е", "и", "й", "о", "у"];
const DERIVATIONAL = ["ость", "ост"];

/** Начало «области глагола» (после первой гласной) и «второй области» (после следующей пары гласная+согласная). */
function regions(w) {
  const n = w.length;
  let i = 0;
  while (i < n && !isVowel(w[i])) i++;
  if (i >= n) return [n, n];
  const rv = ++i;
  const skip = () => {
    // «gopast non-v»: пройти гласные и один согласный
    while (i < n && isVowel(w[i])) i++;
    if (i >= n) return false;
    i++;
    return true;
  };
  const skipVowel = () => {
    while (i < n && !isVowel(w[i])) i++;
    if (i >= n) return false;
    i++;
    return true;
  };
  if (!skip() || !skipVowel() || !skip()) return [rv, n];
  return [rv, i];
}

/**
 * Самое длинное окончание из групп, начинающееся не раньше позиции from. Возвращает {suf, group} или null.
 * Группы: [список, нужна ли гласная «а/я» перед окончанием].
 */
function longest(w, from, groups) {
  let best = null;
  for (const [list, needAYA] of groups) {
    for (const suf of list) {
      if (w.length - suf.length < from || !w.endsWith(suf)) continue;
      if (!best || suf.length > best.suf.length) best = { suf, needAYA };
    }
  }
  return best;
}

/** Отрезает окончание, если оно найдено и (когда нужно) перед ним «а» или «я». Возвращает новое слово или null. */
function cut(w, from, ...groups) {
  const m = longest(w, from, groups);
  if (!m) return null;
  const at = w.length - m.suf.length; // где начинается окончание
  // «а/я» перед окончанием должна лежать внутри допустимой области, как в Snowball
  if (m.needAYA && !(at - 1 >= from && AYA(w[at - 1]))) return null;
  return w.slice(0, at);
}

export function ruStem(word) {
  let w = String(word || "").toLowerCase().replace(/ё/g, "е");
  if (!w) return w;
  const [pV, p2] = regions(w);

  const next = (() => {
    // 1. деепричастие; если его нет, то: возвратная частица, затем прилагательное (с причастием), глагол или существительное
    let r = cut(w, pV, [PERFECTIVE_A, true], [PERFECTIVE_B, false]);
    if (r !== null) return r;
    let base = cut(w, pV, [REFLEXIVE, false]) ?? w;
    let adj = cut(base, pV, [ADJECTIVE, false]);
    if (adj !== null) {
      const part = cut(adj, pV, [PARTICIPLE_A, true], [PARTICIPLE_B, false]);
      return part ?? adj;
    }
    return cut(base, pV, [VERB_A, true], [VERB_B, false]) ?? cut(base, pV, [NOUN, false]) ?? base;
  })();
  w = next;

  // 2. конечная «и»
  if (w.endsWith("и") && w.length - 1 >= pV) w = w.slice(0, -1);
  // 3. суффикс «ость/ост» во второй области
  const d = cut(w, p2, [DERIVATIONAL, false]);
  if (d !== null) w = d;
  // 4. уборка: «ейш», двойное «нн», мягкий знак
  if (w.endsWith("ейше") && w.length - 4 >= pV) w = w.slice(0, -4);
  else if (w.endsWith("ейш") && w.length - 3 >= pV) w = w.slice(0, -3);
  if (w.endsWith("нн") && w.length - 1 >= pV) w = w.slice(0, -1);
  else if (w.endsWith("ь") && w.length - 1 >= pV) w = w.slice(0, -1);
  return w;
}
