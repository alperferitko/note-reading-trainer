// Curated introductory content. Completion means a knowledge check, not instrumental mastery.
const bilingual = (tr, en) => ({ tr, en });
const question = (tr, en, trOptions, enOptions, answerIndex, trExplanation, enExplanation) => ({
  prompt: bilingual(tr, en), options: bilingual(trOptions, enOptions), answerIndex,
  explanation: bilingual(trExplanation, enExplanation),
});
const lesson = (id, skill, minutes, destination, title, goal, explanation, tip, questions) => ({
  id, skill, minutes, destination, title: bilingual(...title), goal: bilingual(...goal),
  explanation: bilingual(...explanation), tip: bilingual(...tip), questions,
});

export const LESSON_PROGRESS_KEY = 'notanota-learning-v1';
export const LEARNING_LESSONS = [
  lesson('staff-basics', 'reading', 3, 'setup',
    ['Porteyi tanı', 'Meet the staff'],
    ['Çizgi ve aralıkları ayırt et.', 'Distinguish lines from spaces.'],
    ['Porte beş çizgiden oluşur. Çizgiler aşağıdan yukarı sayılır. Nota başı çizginin tam üzerindeyse çizgi notası, iki çizgi arasındaysa aralık notasıdır. Sol anahtarında yukarı hareket eden doğal notalar daha ince sesleri gösterir.', 'A staff has five lines, counted from bottom to top. A notehead centred on a line is a line note; between lines it is a space note. In treble clef, ascending natural notes represent higher pitches.'],
    ['Önce nota başının merkezine bak; sapın uzunluğu sesin yüksekliğini belirlemez.', 'Look at the centre of the notehead. Stem length does not determine pitch.'], [
      question('Porte kaç çizgiden oluşur?', 'How many lines does a staff have?', ['Dört', 'Beş', 'Altı'], ['Four', 'Five', 'Six'], 1, 'Beş çizgi ve bu çizgiler arasında dört aralık vardır.', 'There are five lines and four spaces between them.'),
      question('Bir notanın portedeki yerini hangi bölüm belirler?', 'Which part determines a note’s staff position?', ['Sapın ucu', 'Nota başının merkezi', 'Bayrağın yönü'], ['Stem tip', 'Centre of the notehead', 'Flag direction'], 1, 'Nota başının merkezinin çizgiye veya aralığa göre konumuna bakılır.', 'Read the centre of the notehead relative to the staff lines.'),
    ]),
  lesson('treble-anchors', 'reading', 4, 'setup',
    ['Referans notalar', 'Anchor notes'],
    ['Sol anahtarında Mi ve Sol konumlarını kullan.', 'Use E and G as treble-clef anchors.'],
    ['Sol anahtarında en alt çizgi Mi, alttan ikinci çizgi Sol’dür. Bu iki çizgi arasındaki aralık Fa’dır. Komşu çizgi ve aralıklara geçerken doğal nota sırası Do–Re–Mi–Fa–Sol–La–Si olarak ilerler.', 'In treble clef, the bottom line is E and the second line is G. The space between them is F. Moving to a neighbouring line or space advances one letter in C–D–E–F–G–A–B order.'],
    ['Her soruda baştan saymak yerine bildiğin en yakın referans notadan ilerle.', 'Start from the nearest anchor you know rather than recounting the entire staff.'], [
      question('Sol anahtarında en alt çizgide hangi nota bulunur?', 'Which note is on the bottom line in treble clef?', ['Do', 'Mi', 'Sol'], ['C', 'E', 'G'], 1, 'En alt çizgi Mi’dir.', 'The bottom line is E.'),
      question('En alt iki çizgi arasındaki aralık hangi notadır?', 'Which note occupies the space between the lowest two lines?', ['Fa', 'La', 'Re'], ['F', 'A', 'D'], 0, 'Mi ile Sol arasındaki doğal nota Fa’dır.', 'F lies between E and G.'),
    ]),
  lesson('ledger-lines', 'reading', 4, 'setup',
    ['Ek çizgilerde yön bul', 'Find your way on ledger lines'],
    ['Portenin hemen dışındaki notaları tanı.', 'Recognise notes immediately outside the staff.'],
    ['Ek çizgiler, portenin altına ve üstüne eklenen kısa çizgilerdir. Sol anahtarında portenin altındaki ilk ek çizgi Do4’tür; bununla en alt porte çizgisi Mi4 arasındaki aralık Re4’tür. Portenin en üst çizgisi Fa5, üstündeki aralık Sol5 ve ilk üst ek çizgi La5’tir.', 'Ledger lines extend the staff with short lines. In treble clef, the first ledger line below is C4; the space between it and the bottom staff line E4 is D4. The top staff line is F5, the space above is G5, and the first ledger line above is A5.'],
    ['Alt ve üst ek çizgileri ayrı çalış. Önce ilk ek çizgiyi öğren, sonra kapsamı genişlet.', 'Practise lower and upper ledger lines separately. Start with the first ledger line before expanding.'], [
      question('Sol anahtarında portenin altındaki ilk ek çizgi hangi notadır?', 'What is the first ledger line below a treble staff?', ['Do4', 'Re4', 'Mi4'], ['C4', 'D4', 'E4'], 0, 'İlk alt ek çizgi orta Do, yani Do4’tür.', 'The first lower ledger line is middle C, C4.'),
      question('Sol anahtarında portenin üstündeki ilk ek çizgi hangi notadır?', 'What is the first ledger line above a treble staff?', ['Sol5', 'La5', 'Si5'], ['G5', 'A5', 'B5'], 1, 'Üst çizgi Fa5, üstündeki aralık Sol5, ilk ek çizgi La5’tir.', 'The top line is F5, followed by space G5 and ledger-line A5.'),
    ]),
  lesson('octaves', 'reading', 3, 'setup',
    ['Aynı ad, farklı oktav', 'Same name, different octave'],
    ['Nota adıyla ses yüksekliğini birbirinden ayır.', 'Distinguish a note name from an exact pitch.'],
    ['Do–Re–Mi–Fa–Sol–La–Si dizisinden sonra nota adları yeniden başlar. Do4 ve Do5 aynı adı taşır, fakat Do5 bir oktav daha incedir. Sadece Do adını bilmek her zaman hangi sesi çalacağını belirlemeye yetmez.', 'Note names repeat after C–D–E–F–G–A–B. C4 and C5 share a name, but C5 is one octave higher. Knowing only the letter C does not always identify the exact pitch to play.'],
    ['Gitarda aynı adlı bütün yerleri değil, sorulan ses yüksekliğine uyan yerleri ara.', 'On guitar, look for the requested exact pitch, not every fret sharing its letter name.'], [
      question('Do4 ile Do5 aynı ses yüksekliğinde midir?', 'Are C4 and C5 the same pitch?', ['Evet', 'Hayır, Do5 daha incedir', 'Hayır, Do4 daha incedir'], ['Yes', 'No, C5 is higher', 'No, C4 is higher'], 1, 'Do5, Do4’ün bir oktav üstündedir.', 'C5 is one octave above C4.'),
      question('Si’den sonra yukarı doğru hangi doğal nota adı gelir?', 'Which natural note name follows B upwards?', ['La', 'Re', 'Do'], ['A', 'D', 'C'], 2, 'Nota adları Do ile yeni oktavda tekrar başlar.', 'The note names restart at C in the next octave.'),
    ]),
  lesson('pulse-tempo', 'rhythm', 3, 'pieces',
    ['Vuruşu sabit tut', 'Keep a steady pulse'],
    ['Tempo ile nota süresinin farkını anla.', 'Distinguish tempo from note duration.'],
    ['Tempo, seçilen vuruş biriminin bir dakikada kaç kez gerçekleştiğini söyler. Dörtlük = 60 BPM ise her dörtlük vuruş bir saniyedir. Daha kısa notalara geçtiğinde ana vuruş hızlanmaz; vuruşun içine daha fazla nota yerleşir.', 'Tempo states how many selected beat units occur per minute. At quarter note = 60 BPM, each quarter-note beat lasts one second. Shorter notes do not speed up the main pulse; more notes fit inside each beat.'],
    ['Önce sadece metronomla eşit aralıklarda vur. Nota adlarını bundan sonra ekle.', 'First tap evenly with the metronome. Add pitch reading afterwards.'], [
      question('Dörtlük = 60 BPM iken iki vuruş arası kaç saniyedir?', 'At quarter note = 60 BPM, how long is one beat?', ['Yarım saniye', 'Bir saniye', 'İki saniye'], ['Half a second', 'One second', 'Two seconds'], 1, '60 saniyede 60 vuruş: vuruş başına bir saniye.', '60 beats in 60 seconds means one second per beat.'),
      question('Onaltılıklara geçince ana metronom vuruşu ne yapar?', 'What happens to the main metronome pulse during sixteenth notes?', ['Hızlanır', 'Durur', 'Aynı tempoda sürer'], ['Speeds up', 'Stops', 'Keeps the same tempo'], 2, 'Nota bölünmeleri değişir; seçilen tempo aynı kalır.', 'The subdivisions change; the chosen tempo stays the same.'),
    ]),
  lesson('note-values', 'rhythm', 4, 'pieces',
    ['Uzun ve kısa notalar', 'Long and short notes'],
    ['Dörtlük vuruşa göre temel süreleri karşılaştır.', 'Compare basic durations using a quarter-note beat.'],
    ['Dörtlük bir vuruş kabul edildiğinde birlik dört, ikilik iki, dörtlük bir vuruş sürer. İkilik nota boş başlı ve saplıdır; birlik boş başlı ve sapsızdır. Nota süresi ile sesin inceliği farklı bilgilerdir.', 'With a quarter-note beat, a whole note lasts four beats, a half note two, and a quarter note one. Half notes have an open head and a stem; whole notes have an open head without a stem. Duration and pitch are separate properties.'],
    ['Uzun notada da içinden vuruşları saymaya devam et.', 'Keep counting the pulse internally during long notes.'], [
      question('Dörtlük bir vuruşsa birlik kaç vuruştur?', 'If a quarter note is one beat, how many beats is a whole note?', ['Bir', 'İki', 'Dört'], ['One', 'Two', 'Four'], 2, 'Bir birlik, dört dörtlük süresine eşittir.', 'One whole note lasts as long as four quarter notes.'),
      question('Boş başlı ve saplı temel nota değeri hangisidir?', 'Which basic note value has an open head and a stem?', ['İkilik', 'Dörtlük', 'Birlik'], ['Half note', 'Quarter note', 'Whole note'], 0, 'İkilik boş başlı ve saplı; birlik sapsızdır.', 'A half note has an open head and a stem; a whole note has no stem.'),
    ]),
  lesson('subdivisions', 'rhythm', 4, 'pieces',
    ['Bir vuruşun içini böl', 'Subdivide the beat'],
    ['Sekizlik, onaltılık ve üçlemeyi ayırt et.', 'Distinguish eighths, sixteenths and triplets.'],
    ['Bir dörtlük vuruşa iki eşit sekizlik veya dört eşit onaltılık sığar. Sekizlik üçlemede aynı süreye üç eşit nota yerleşir. Gruplardaki notaların sesleri farklı olabilir; birleştiren kiriş süre grubunu gösterir.', 'One quarter-note beat holds two equal eighth notes or four equal sixteenths. An eighth-note triplet fits three equal notes into that same duration. Their pitches can differ; the beam groups their rhythmic values.'],
    ['Önce tek sesle ritmi uygula; sonra aynı ritimde farklı notalar oku.', 'Practise the rhythm on one pitch first, then read different pitches using that rhythm.'], [
      question('Bir dörtlük vuruşa kaç eşit onaltılık sığar?', 'How many equal sixteenth notes fit one quarter-note beat?', ['İki', 'Üç', 'Dört'], ['Two', 'Three', 'Four'], 2, 'Dört onaltılık bir dörtlük süresindedir.', 'Four sixteenths last as long as one quarter note.'),
      question('Sekizlik üçlemede bir dörtlük süreye kaç eşit nota yerleşir?', 'How many equal eighth-note triplets fit one quarter-note duration?', ['İki', 'Üç', 'Altı'], ['Two', 'Three', 'Six'], 1, 'Üçleme, aynı süreyi üç eşit parçaya böler.', 'A triplet divides that duration into three equal parts.'),
    ]),
  lesson('rests-measures', 'rhythm', 4, 'pieces',
    ['Sus ve ölçü', 'Rests and measures'],
    ['Sessizlikte de vuruşun sürdüğünü kavra.', 'Understand that the pulse continues during silence.'],
    ['Sus işareti, belirtilen süre boyunca yeni nota çalmamayı anlatır; zaman akmaya devam eder. 4/4 ölçüde bir ölçü dört dörtlük vuruş içerir. Nota ve sus süreleri birlikte ölçüyü doldurur. Buradaki bilgi kontrolünden sonra ritim oturumunda süre saymayı çalışabilirsin; mevcut rastgele oturum sus üretmez.', 'A rest indicates silence for its duration; time continues. A 4/4 measure contains four quarter-note beats. Notes and rests together fill the measure. After this knowledge check, practise counting durations in the rhythm session; the current random session does not generate rests.'],
    ['Sus sırasında da vuruşu içinden say; sonraki giriş yerini önceden düşün.', 'Count internally during a rest and anticipate the next entry.'], [
      question('4/4 ölçüde iki dörtlük ve bir ikilik toplam kaç ölçü doldurur?', 'In 4/4, two quarters and one half note fill how many measures?', ['Yarım', 'Bir', 'İki'], ['Half', 'One', 'Two'], 1, '1 + 1 + 2 = 4 dörtlük vuruş, yani bir ölçü.', '1 + 1 + 2 = 4 quarter-note beats, one measure.'),
      question('Sus sırasında metronomun vuruşu devam eder mi?', 'Does the metronome pulse continue during a rest?', ['Evet', 'Hayır', 'Yalnız hızlı tempoda'], ['Yes', 'No', 'Only at fast tempos'], 0, 'Sessizlik de ölçülen bir müzik süresidir.', 'Silence also occupies measured musical time.'),
    ]),
  lesson('accidentals', 'reading', 4, 'setup',
    ['Diyez, bemol, natürel', 'Sharps, flats and naturals'],
    ['Değiştirme işaretlerinin etkisini öğren.', 'Learn what accidentals change.'],
    ['Diyez (♯) notayı yarım ses yükseltir; bemol (♭) yarım ses alçaltır. Natürel (♮) ilgili değişikliği kaldırır. İşaret, nota adını başka bir harfe dönüştürmez: Fa diyez yine Fa adıyla yazılır. Enstrümandaki ses ile portedeki yazılış birlikte değerlendirilir.', 'A sharp (♯) raises a note by a semitone; a flat (♭) lowers it by a semitone. A natural (♮) cancels an alteration. The letter stays the same: F sharp is still written as F. Consider both the sounding pitch and its written spelling.'],
    ['Önce nota başının yerini, sonra değiştirme işaretini oku.', 'Read the notehead position first, then its accidental.'], [
      question('Bemol bir doğal notayı nasıl değiştirir?', 'How does a flat change a natural note?', ['Yarım ses alçaltır', 'Yarım ses yükseltir', 'Bir oktav yükseltir'], ['Lowers by a semitone', 'Raises by a semitone', 'Raises by an octave'], 0, 'Bemol yarım ses alçaltır.', 'A flat lowers by one semitone.'),
      question('Fa diyez yazılırken temel harf adı değişir mi?', 'Does the underlying letter change when F becomes F sharp?', ['Evet, Sol olur', 'Hayır, Fa olarak kalır', 'Evet, Mi olur'], ['Yes, it becomes G', 'No, it stays F', 'Yes, it becomes E'], 1, 'Değiştirme işareti ses yüksekliğini değiştirir; harf Fa olarak kalır.', 'The accidental alters the pitch; the letter remains F.'),
    ]),
  lesson('bass-clef', 'reading', 4, 'setup',
    ['Fa anahtarına giriş', 'Meet the bass clef'],
    ['Anahtar değişince nota yerlerinin değiştiğini fark et.', 'Recognise that a clef changes note-position meanings.'],
    ['Fa anahtarının iki noktası, alttan dördüncü çizgideki Fa3’ü çevreler. En alt çizgi Sol2’dir. Sol anahtarında öğrendiğin çizgi adlarını fa anahtarına aynen taşıyamazsın: okumadan önce anahtarı kontrol et.', 'The two dots of the bass clef surround F3 on the fourth line from the bottom. Its bottom line is G2. Treble-clef line names do not carry over unchanged: check the clef before reading.'],
    ['Yeni anahtarda küçük bir aralıkla başla; iki anahtarı hemen karıştırmak zorunda değilsin.', 'Begin with a small range in the new clef; you do not need to mix both clefs immediately.'], [
      question('Fa anahtarında en alt çizgi hangi notadır?', 'What is the bottom line in bass clef?', ['Mi2', 'Sol2', 'Fa3'], ['E2', 'G2', 'F3'], 1, 'Fa anahtarında en alt çizgi Sol2’dir.', 'The bottom line in bass clef is G2.'),
      question('Fa anahtarının iki noktası hangi çizgiyi çevreler?', 'Which line do the bass-clef dots surround?', ['Alttan ikinci', 'Alttan üçüncü', 'Alttan dördüncü'], ['Second from bottom', 'Third from bottom', 'Fourth from bottom'], 2, 'Alttan dördüncü çizgi Fa3’tür.', 'The fourth line from the bottom is F3.'),
    ]),
  lesson('guitar-map', 'guitar', 5, 'guitar',
    ['Porteden gitara', 'From staff to guitar'],
    ['Tel, perde ve aynı sesin farklı konumlarını ayırt et.', 'Distinguish strings, frets and alternative locations for the same pitch.'],
    ['Standart akortta 1. tel en ince Mi, 6. tel en kalın Mi telidir. Boş tel, hiçbir perdeye basmadan çalınır. Her perde sesi yarım ses yükseltir. Aynı ses birden fazla tel–perde birleşiminde bulunabilir. Gitarın sol anahtarlı yazımı, duyulan sesten bir oktav yukarıdadır.', 'In standard tuning, string 1 is the highest E string and string 6 the lowest E string. An open string is played without fretting. Each fret raises pitch by a semitone. The same pitch can occur on several string–fret combinations. Guitar treble notation is written one octave above its sounding pitch.'],
    ['Bir konumu bulduğunda durma: çalışma birden fazla konum istiyorsa aynı ses yüksekliğini diğer tellerde de ara.', 'After finding one location, look on other strings for the same exact pitch if the exercise asks for multiple locations.'], [
      question('Boş tel ne demektir?', 'What is an open string?', ['Hiçbir perdeye basmadan çalınan tel', 'En yüksek perde', 'Sesi olmayan tel'], ['A string played without fretting', 'The highest fret', 'A string with no sound'], 0, 'Boş telde sol el bir perdeye basmaz.', 'An open string is not stopped at a fret.'),
      question('Standart akortta 2. tel 5. perde ile 1. boş tel aynı sesi verir mi?', 'In standard tuning, do string 2 fret 5 and open string 1 sound the same pitch?', ['Evet, ikisi de Mi4', 'Hayır, bir oktav farklı', 'Hayır, farklı nota adları'], ['Yes, both are E4', 'No, one octave apart', 'No, different note names'], 0, 'Si3 telinde beş yarım ses yükselince Mi4 elde edilir.', 'Raising the B3 string by five semitones gives E4.'),
    ]),
  lesson('piano-map', 'piano', 4, 'piano',
    ['Tuşlarda yön bul', 'Find your way on the keys'],
    ['Siyah tuş gruplarından Do ve Fa’yı bul.', 'Find C and F from the black-key groups.'],
    ['Piyanoda siyah tuşlar ikili ve üçlü gruplar hâlinde tekrarlanır. İkili siyah tuş grubunun hemen solundaki beyaz tuş Do, üçlü grubun hemen solundaki beyaz tuş Fa’dır. Sağa ilerledikçe sesler incelir. Ekrandaki tuşu tanımak, gerçek piyanoda el tekniğini değerlendirmez.', 'Black keys repeat in groups of two and three. The white key immediately left of a two-black-key group is C; immediately left of a three-black-key group is F. Pitch rises to the right. Recognising an on-screen key does not assess physical piano technique.'],
    ['Önce Do’ları bul, sonra çevresindeki beyaz tuşları adlandır.', 'Find the Cs first, then name the neighbouring white keys.'], [
      question('İkili siyah tuş grubunun hemen solundaki beyaz tuş hangisidir?', 'Which white key is immediately left of a two-black-key group?', ['Fa', 'Do', 'Si'], ['F', 'C', 'B'], 1, 'İkili grubun hemen solundaki tuş Do’dur.', 'C is immediately left of the two-black-key group.'),
      question('Piyanoda sağa ilerledikçe ses nasıl değişir?', 'What happens to pitch as you move right on a piano?', ['Kalınlaşır', 'Değişmez', 'İncelir'], ['Gets lower', 'Stays the same', 'Gets higher'], 2, 'Sağdaki tuşlar daha ince sesler üretir.', 'Keys further right produce higher pitches.'),
    ]),
];

/** Accept only known completed checks. Never treat arbitrary local data as content. */
export function validCompletedLessons(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string' && LEARNING_LESSONS.some(l => l.id === id)))];
}

const moduleSkill = value => {
  const name = String(value).toLocaleLowerCase('tr-TR');
  if (/gitar|guitar/.test(name)) return 'guitar';
  if (/piyano|piano/.test(name)) return 'piano';
  if (/eser|score|ritim|rhythm/.test(name)) return 'score';
  if (/nota|note|reading/.test(name)) return 'reading';
  return 'other';
};

export function validLearningHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(row => {
    if (!row || typeof row.id !== 'string' || !row.id || seen.has(row.id)
      || typeof row.module !== 'string' || !Number.isFinite(Date.parse(row.date))
      || !Number.isInteger(row.correct) || row.correct < 0
      || !Number.isInteger(row.wrong) || row.wrong < 0 || row.correct + row.wrong === 0
      || !Number.isFinite(row.milliseconds) || row.milliseconds < 0) return false;
    seen.add(row.id);
    return true;
  }).sort((a,b) => Date.parse(a.date) - Date.parse(b.date)).slice(-100);
}

export function summarizeLearning(history) {
  const rows = validLearningHistory(history);
  const correct = rows.reduce((sum,row) => sum + row.correct,0);
  const wrong = rows.reduce((sum,row) => sum + row.wrong,0);
  return {
    sessions: rows.length, correct, wrong, attempts: correct + wrong,
    accuracy: correct + wrong ? Math.round(correct / (correct + wrong) * 100) : null,
    minutes: Math.round(rows.reduce((sum,row) => sum + row.milliseconds,0) / 60000),
  };
}

/** A transparent broad recommendation; aggregate results cannot diagnose a specific skill. */
export function recommendLesson(history, completedIds = []) {
  const rows = validLearningHistory(history).slice(-8);
  const completed = validCompletedLessons(completedIds);
  const categories = ['reading','guitar','piano'];
  const review = categories.map(skill => {
    const evidence = rows.filter(row => moduleSkill(row.module) === skill);
    const attempts = evidence.reduce((sum,row) => sum+row.correct+row.wrong,0);
    const wrong = evidence.reduce((sum,row) => sum+row.wrong,0);
    return {skill, sessions:evidence.length, attempts, wrong, rate: attempts ? wrong/attempts : 0};
  }).filter(item => item.sessions >= 2 && item.attempts >= 10 && item.wrong >= 3 && item.rate >= .3)
    .sort((a,b) => b.rate-a.rate);
  if (review.length) {
    const candidate = review[0];
    const lessonId = { reading:'treble-anchors', guitar:'guitar-map', piano:'piano-map' }[candidate.skill];
    return { lessonId, reason:'review', evidenceSessions:candidate.sessions };
  }
  const next = LEARNING_LESSONS.find(item => !completed.includes(item.id));
  return { lessonId:next?.id ?? 'subdivisions', reason:completed.length ? (next?'continue':'revisit') : 'start', evidenceSessions:0 };
}
