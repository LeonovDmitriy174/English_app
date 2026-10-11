// tts.js — озвучка встроенным синтезатором речи устройства (работает без интернета).

let voice = null;

function pickVoice() {
  const list = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const score = (v) => (/premium|enhanced|natural/i.test(v.name) ? 4 : 0) + (/^en[-_]US/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
  return list.sort((a, b) => score(b) - score(a))[0] || null;
}

export const canSpeak = () => "speechSynthesis" in window;

export function speak(text, { rate = 0.9 } = {}) {
  if (!canSpeak() || !text) return;
  speechSynthesis.cancel();
  voice ||= pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang || "en-US";
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

if (canSpeak()) {
  speechSynthesis.addEventListener?.("voiceschanged", () => {
    voice = pickVoice();
  });
}
