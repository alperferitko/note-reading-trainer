// @ts-check

/** @typedef {"tr" | "en"} Locale */
/** @typedef {"standard" | "endless"} SessionType */
/** @typedef {"Do" | "Re" | "Mi" | "Fa" | "Sol" | "La" | "Si"} SolfegeName */
/** @typedef {"C" | "D" | "E" | "F" | "G" | "A" | "B"} LetterName */
/** @typedef {{ solfege: SolfegeName; letter: LetterName }} NoteClass */
/** @typedef {"perfect" | "strong" | "steady" | "building" | "review" | "empty"} InsightTone */

/** @type {readonly NoteClass[]} */
const NOTE_CLASSES = Object.freeze([
  { solfege: "Do", letter: "C" },
  { solfege: "Re", letter: "D" },
  { solfege: "Mi", letter: "E" },
  { solfege: "Fa", letter: "F" },
  { solfege: "Sol", letter: "G" },
  { solfege: "La", letter: "A" },
  { solfege: "Si", letter: "B" },
]);

/**
 * @param {string} value
 */
export function normalizeNoteAnswer(value) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * Maps both solfège and English letter-name answers to one canonical note class.
 * Invalid free text remains a wrong answer but is not treated as a confusion pair.
 *
 * @param {string} value
 * @returns {NoteClass | null}
 */
export function noteClassFromAnswer(value) {
  const normalized = normalizeNoteAnswer(value);
  return NOTE_CLASSES.find((note) => (
    normalizeNoteAnswer(note.solfege) === normalized
    || normalizeNoteAnswer(note.letter) === normalized
  )) ?? null;
}

/**
 * @param {LetterName} letter
 * @returns {NoteClass}
 */
export function noteClassFromLetter(letter) {
  return NOTE_CLASSES.find((note) => note.letter === letter) ?? NOTE_CLASSES[0];
}

/**
 * A pair needs repetition and a meaningful share of all mistakes before the UI
 * calls it a pattern. This avoids turning one slip into a learner label.
 *
 * @param {Record<string, number>} confusionByPair
 * @param {number} totalWrong
 * @param {{ minCount?: number; minShare?: number }} [thresholds]
 * @returns {{ key: string; count: number; share: number } | null}
 */
export function pickDominantConfusion(confusionByPair, totalWrong, thresholds = {}) {
  const minCount = thresholds.minCount ?? 2;
  const minShare = thresholds.minShare ?? .35;
  const [top] = Object.entries(confusionByPair)
    .filter(([, count]) => count > 0)
    .sort(([keyA, countA], [keyB, countB]) => countB - countA || keyA.localeCompare(keyB));

  if (!top || totalWrong <= 0) return null;
  const [key, count] = top;
  const share = count / totalWrong;
  return count >= minCount && share >= minShare ? { key, count, share } : null;
}

const SCORE_COPY = {
  tr: {
    empty: {
      title: "Bir sonraki tur için hazırsın.",
      body: "Bu oturum henüz bir okuma örüntüsü oluşturmadı.",
    },
    perfect: {
      title: "Temiz bir ilk okuma.",
      body: "Bütün notaları ilk denemede doğru okudun.",
    },
    cleanStart: (/** @type {number} */ count) => ({
      title: count >= 7 ? "Hatasız bir seri." : "Temiz bir başlangıç.",
      body: `${count} doğru cevabın tamamı ilk denemede geldi.`,
    }),
    strong: {
      title: "Oldukça tutarlı bir tur.",
      body: "Neredeyse bütün notaları ilk denemede doğru okudun.",
    },
    steady: {
      title: "Sağlam bir ilk okuma.",
      body: "Notaların büyük bölümünü ilk denemede doğru okudun.",
    },
    building: {
      title: "Doğrular çoğunlukta.",
      body: "Tekrar listen bir sonraki tur için net bir başlangıç sunuyor.",
    },
    review: {
      title: "Tekrar için net bir rota.",
      body: "Bu turda daha çok dikkat isteyen notaları aşağıda ayırdık.",
    },
    quickCheck: "Tempon yüksek; yanıtlamadan önce konumu bir an kontrol etmek doğruluğu güçlendirebilir.",
    fluentNext: "Doğruluk güçlü; aynı netliği koruyarak tempoyu zamanla daha akıcı hâle getirebilirsin.",
    pace: ["Hızlı tempo", "Dengeli tempo", "Ölçülü tempo", "Düşünerek ilerlenen tempo"],
    average: (/** @type {string} */ seconds) => `Ortalama ${seconds} sn`,
  },
  en: {
    empty: {
      title: "Ready for the next run.",
      body: "This session did not yet produce a reading pattern.",
    },
    perfect: {
      title: "A clean first read.",
      body: "You identified every note correctly on the first try.",
    },
    cleanStart: (/** @type {number} */ count) => ({
      title: count >= 7 ? "A mistake-free streak." : "A clean start.",
      body: `All ${count} correct ${count === 1 ? "answer came" : "answers came"} on the first try.`,
    }),
    strong: {
      title: "A highly consistent run.",
      body: "You identified nearly every note correctly on the first try.",
    },
    steady: {
      title: "A solid first read.",
      body: "You identified most notes correctly on the first try.",
    },
    building: {
      title: "Correct reads were in the majority.",
      body: "Your review list offers a clear starting point for the next run.",
    },
    review: {
      title: "A clear route for review.",
      body: "We set aside the notes that called for more attention in this run.",
    },
    quickCheck: "Your pace was quick; a brief position check before answering may strengthen accuracy.",
    fluentNext: "Accuracy was strong; keep that clarity as your reading gradually becomes more fluent.",
    pace: ["Quick pace", "Steady pace", "Measured pace", "Deliberate pace"],
    average: (/** @type {string} */ seconds) => `${seconds} sec on average`,
  },
};

/**
 * @param {{
 *   locale: Locale;
 *   sessionType: SessionType;
 *   completed: boolean;
 *   firstTryRate: number;
 *   totalWrong: number;
 *   attemptCount: number;
 *   correctCount: number;
 *   averageResponseMs: number;
 * }} input
 */
export function buildSessionInsight(input) {
  const copy = SCORE_COPY[input.locale];
  const attemptCount = Math.max(0, input.attemptCount);
  const correctCount = Math.max(0, input.correctCount);
  const rate = Math.max(0, Math.min(100, input.firstTryRate));
  let tone = /** @type {InsightTone} */ ("review");
  let message;

  if (attemptCount === 0) {
    tone = "empty";
    message = copy.empty;
  } else if (rate === 100 && input.totalWrong === 0) {
    if (input.sessionType === "standard" && input.completed) {
      tone = "perfect";
      message = copy.perfect;
    } else {
      tone = correctCount >= 7 ? "perfect" : "strong";
      message = copy.cleanStart(correctCount);
    }
  } else if (rate >= 85) {
    tone = "strong";
    message = copy.strong;
  } else if (rate >= 70) {
    tone = "steady";
    message = copy.steady;
  } else if (rate >= 50) {
    tone = "building";
    message = copy.building;
  } else {
    tone = "review";
    message = copy.review;
  }

  const averageResponseMs = Math.max(0, input.averageResponseMs);
  const seconds = (averageResponseMs / 1000)
    .toFixed(2)
    .replace(".", input.locale === "tr" ? "," : ".");
  const paceIndex = averageResponseMs <= 2500 ? 0 : averageResponseMs <= 5000 ? 1 : averageResponseMs <= 8000 ? 2 : 3;
  const pace = attemptCount ? `${copy.pace[paceIndex]} · ${copy.average(seconds)}` : "";

  let nextStep = "";
  if (attemptCount && rate < 70 && averageResponseMs <= 2500) nextStep = copy.quickCheck;
  else if (attemptCount && rate >= 85 && averageResponseMs > 8000) nextStep = copy.fluentNext;

  return { ...message, tone, pace, nextStep };
}
