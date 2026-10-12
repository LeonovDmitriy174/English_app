// judge.js — оценка письменного ответа. Чистые функции без DOM, проверяются в Node (tests/judge.test.mjs).
import { distance } from "./lex.js";

/** Ответ для сравнения: без регистра, знаков и лишних пробелов; разные апострофы считаются одним. */
export const normAnswer = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Оценка ответа: 'ok' (верно) | 'near' (опечатка в одну букву, для длинных слов в две) | 'no'. */
export function judge(answer, expected) {
  const a = normAnswer(answer);
  const e = normAnswer(expected);
  if (!a) return "no";
  if (a === e) return "ok";
  const d = distance(a, e);
  return d === 1 || (e.length >= 8 && d === 2) ? "near" : "no";
}

/**
 * Оценка ответа на пропуск в предложении. expected — слово так, как оно стоит в предложении, lemma — слово карточки.
 * Если вписали начальную форму, а в предложении другая, слово человек вспомнил: base = true, и приложение просит
 * вписать нужную форму вторым шагом, а не засчитывает ошибку.
 */
export function judgeCloze(answer, expected, lemma) {
  const v = judge(answer, expected);
  if (v === "ok") return { verdict: "ok", base: false };
  const a = normAnswer(answer);
  if (a && a === normAnswer(lemma) && a !== normAnswer(expected)) return { verdict: "near", base: true };
  return { verdict: v, base: false };
}
