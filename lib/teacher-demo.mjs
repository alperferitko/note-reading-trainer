// NotaNota AI sample conversation. It runs entirely in the browser from prepared, branching
// scenarios: no model, no network. The interface talks to it through the same adapter shape a
// connected teacher would implement ({ mode, topics(locale), ask(request) }), so the two stay separate.

const TOPICS = {
  'sol-la': {
    question: { tr: 'Sol ve la notalarını karıştırıyorum. Nasıl çalışmalıyım?', en: 'I mix up G and A. How should I practise?' },
    answer: {
      tr: [
        'Önce ikisini birlikte tanıyalım. Sol, sol anahtarında alttan ikinci çizgide; la, onun hemen üstündeki aralıkta.',
        'Sol anahtarının kıvrımı da bu çizgiyi sarar; sol çizgisini oradan bulabilirsin. La bir adım yukarıda, çizginin değil aralığın içinde durur.',
        'Önce birkaç yavaş soru deneyelim: yalnız sol ve la, sekiz soru.',
      ],
      en: [
        'Let us look at them together first. In the treble clef, G sits on the second line from the bottom; A sits in the space just above it.',
        'The curl of the treble clef wraps around that line, so you can find G from it. A is one step higher, inside the space rather than on a line.',
        'Let us try a few slow questions first: only G and A, eight questions.',
      ],
    },
    staff: { notes: [{ id: 'g4', position: 2 }, { id: 'a4', position: 3 }], focus: 'g4' },
    hint: { tr: 'Kıvrımın ortasından geçen çizgi soldur. Notanın içinden çizgi geçiyorsa sol, nota iki çizginin arasındaysa la.', en: 'The line through the middle of the curl is G. If a line runs through the note it is G; if it sits between two lines it is A.' },
    actions: [
      { id: 'open-focus', label: { tr: 'Sol–la alıştırmasını aç', en: 'Open the G–A drill' }, detail: { tr: '8 soru, yalnız sol ve la', en: '8 questions, only G and A' }, payload: { notes: ['g4', 'a4'], repeats: 4 } },
    ],
    planTitle: { tr: 'Sol–la ayrımı: 8 soruluk alıştırma', en: 'G–A drill: 8 questions' },
  },
  'slow-measure': {
    question: { tr: 'Örnek oturumda en çok nerede zorlandım?', en: 'Where did I struggle most in the sample session?' },
    sample: {
      title: { tr: 'Örnek oturum verisi · gerçek kaydın değil', en: 'Sample session data · not your record' },
      rows: [
        { tr: 'Eser: Küçük Yürüyüş, ölçü 1–2, notayı adıyla söyleme', en: 'Piece: Little Walk, bars 1–2, naming notes' },
        { tr: 'Ölçü 1: 4 notada 0 yanlış', en: 'Bar 1: 0 wrong out of 4 notes' },
        { tr: 'Ölçü 2: 3 notada 2 yanlış (la yerine sol iki kez)', en: 'Bar 2: 2 wrong out of 3 notes (G for A twice)' },
        { tr: 'Ritim ve tempo ölçülmedi', en: 'Rhythm and tempo were not measured' },
      ],
    },
    answer: {
      tr: [
        'Bu örnek oturumda hatalar ölçü 2’de toplanmış: aynı notada iki kez la yerine sol denmiş.',
        'Ölçü 2’yi tek başına ve acele etmeden çalışmanı öneririm. Önce yalnız o ölçünün notalarını adlarıyla söyle, sonra iki ölçüyü birleştir.',
        'Bu veride ritim ölçülmediği için zamanlama hakkında bir şey söyleyemem.',
      ],
      en: [
        'In this sample session the mistakes cluster in bar 2: the same note was named G instead of A twice.',
        'I suggest working on bar 2 on its own, without hurrying. Name only that bar’s notes first, then join the two bars.',
        'Rhythm was not measured in this data, so I cannot say anything about timing.',
      ],
    },
    staff: { notes: [{ id: 'f4', position: 1 }, { id: 'a4', position: 3 }, { id: 'g4', position: 2, beats: 2 }], focus: 'a4', measure: 2 },
    hint: { tr: 'Ölçü 2’nin ortasındaki nota la: ikinci aralıkta duruyor, içinden çizgi geçmiyor.', en: 'The middle note of bar 2 is A: it sits in the second space, no line runs through it.' },
    actions: [
      { id: 'open-measure', label: { tr: 'Ölçü 2’yi eserde aç', en: 'Open bar 2 in the piece' }, detail: { tr: 'Küçük Yürüyüş, yalnız ölçü 2', en: 'Little Walk, bar 2 only' }, payload: { from: 2, to: 2 } },
    ],
    planTitle: { tr: 'Küçük Yürüyüş: ölçü 2’yi tek başına çalış', en: 'Little Walk: practise bar 2 on its own' },
  },
  ledger: {
    question: { tr: 'Ek çizgili notaları okumakta zorlanıyorum.', en: 'I find notes on ledger lines hard to read.' },
    answer: {
      tr: [
        'Ek çizgiler porteyi yukarı ve aşağı uzatır; sayarak değil, sabit noktalardan okumak daha hızlıdır.',
        'İki sabit nokta yeter: portenin altındaki ilk ek çizgi do, üstündeki ilk ek çizgi la. Diğerlerini bunlardan birer adım sayarak bul.',
        'Önce bu dört notayla başlayalım: do, re, sol ve la.',
      ],
      en: [
        'Ledger lines extend the staff up and down; reading them from fixed landmarks is faster than counting.',
        'Two landmarks are enough: the first ledger line below the staff is C, the first above is A. Find the others one step from these.',
        'Let us start with these four notes: C, D, G and A.',
      ],
    },
    staff: { notes: [{ id: 'c4', position: -2 }, { id: 'd4', position: -1 }, { id: 'g5', position: 9 }, { id: 'a5', position: 10 }], focus: 'c4' },
    hint: { tr: 'Altta tek ek çizginin üzerindeki nota do; hemen altındaki boşluğa değil, çizginin tam üstüne oturur.', en: 'The note on the single ledger line below is C; it sits right on the line.' },
    actions: [
      { id: 'open-focus', label: { tr: 'Ek çizgi alıştırmasını aç', en: 'Open the ledger-line drill' }, detail: { tr: '8 soru: do, re, sol, la', en: '8 questions: C, D, G, A' }, payload: { notes: ['c4', 'd4', 'g5', 'a5'], repeats: 2 } },
    ],
    planTitle: { tr: 'Ek çizgiler: do, re, sol, la', en: 'Ledger lines: C, D, G, A' },
  },
};

export const TOPIC_IDS = Object.keys(TOPICS);

const KEYWORDS = [
  ['sol-la', [/\bsol\b.*\bla\b|\bla\b.*\bsol\b/, /\bg\b.*\ba\b|\ba\b.*\bg\b/]],
  ['slow-measure', [/ölçü|\bbars?\b|measure|nerede zorlan|where .*struggl|örnek oturum|sample session/]],
  ['ledger', [/ek çizgi|ledger|porte(nin)? (altı|üstü)|above the staff|below the staff/]],
];

export function matchTopic(text) {
  const clean = String(text ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  for (const [id, patterns] of KEYWORDS) if (patterns.some((pattern) => pattern.test(clean))) return id;
  return null;
}

function localise(topic, id, locale) {
  return {
    topicId: id,
    kind: 'answer',
    question: topic.question[locale],
    teacher: topic.answer[locale],
    staff: topic.staff,
    hint: topic.hint[locale],
    sample: topic.sample ? { title: topic.sample.title[locale], rows: topic.sample.rows.map((row) => row[locale]) } : null,
    actions: topic.actions.map((action) => ({ id: action.id, label: action.label[locale], detail: action.detail[locale], payload: action.payload })),
    planTitle: topic.planTitle[locale],
  };
}

export function outOfScope(text, locale = 'tr') {
  return {
    topicId: null,
    kind: 'out-of-scope',
    question: String(text ?? '').slice(0, 280),
    teacher: [locale === 'tr'
      ? 'Bu örnek sohbet yalnız hazırlanmış üç konuyu yanıtlar: sol ile la’yı ayırmak, örnek oturumda zorlanılan ölçü ve ek çizgili notalar. Sorunu bu konulardan birine yakın sorarsan örneği gösterebilirim.'
      : 'This sample conversation only answers three prepared topics: telling G from A, the bar that was hard in the sample session, and notes on ledger lines. Ask about one of those and I can show the example.'],
    staff: null,
    hint: null,
    sample: null,
    actions: [],
    planTitle: null,
  };
}

export function createDemoTeacher() {
  return Object.freeze({
    mode: 'demo',
    topics(locale = 'tr') {
      return TOPIC_IDS.map((id) => ({ id, question: TOPICS[id].question[locale] }));
    },
    /**
     * Answers synchronously from prepared data; a connected teacher would implement the same call.
     * @param {{ topicId?: string | null, text?: string, locale?: 'tr' | 'en' }} [request]
     */
    ask({ topicId = null, text = '', locale = 'tr' } = {}) {
      const id = topicId && TOPICS[topicId] ? topicId : matchTopic(text);
      if (!id) return outOfScope(text, locale);
      const reply = localise(TOPICS[id], id, locale);
      return text && !topicId ? { ...reply, question: String(text).slice(0, 280) } : reply;
    },
  });
}
