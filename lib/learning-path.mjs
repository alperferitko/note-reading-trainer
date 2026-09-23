// Curated introductory content. Completion means a knowledge check, not instrumental mastery.
import { findWeakItems, practiceApplication } from './practice-evidence.mjs';

/**
 * @typedef {'tr'|'en'} Locale
 * @typedef {'setup'|'pieces'|'guitar'|'piano'|'violin'|'ear'} Destination
 * @typedef {{prompt:Record<Locale,string>, options:Record<Locale,string[]>, answerIndex:number, explanation:Record<Locale,string>}} LessonQuestion
 * @typedef {import('./practice-evidence.mjs').ApplicationCriterion} ApplicationCriterion
 * @typedef {{id:string, skill:string, minutes:number, destination:Destination, requires:string[], title:Record<Locale,string>,
 *   goal:Record<Locale,string>, explanation:Record<Locale,string>, tip:Record<Locale,string>, measures:Record<Locale,string>,
 *   application:ApplicationCriterion, questions:LessonQuestion[]}} Lesson
 */

/** @param {string} tr @param {string} en */
const bilingual = (tr, en) => ({ tr, en });
/**
 * @param {string} tr @param {string} en @param {string[]} trOptions @param {string[]} enOptions
 * @param {number} answerIndex @param {string} trExplanation @param {string} enExplanation
 * @returns {LessonQuestion}
 */
const question = (tr, en, trOptions, enOptions, answerIndex, trExplanation, enExplanation) => ({
  prompt: bilingual(tr, en), options: bilingual(trOptions, enOptions), answerIndex,
  explanation: bilingual(trExplanation, enExplanation),
});
/**
 * @param {string} id @param {string} skill @param {number} minutes @param {Destination} destination @param {string[]} requires
 * @param {[string,string]} title @param {[string,string]} goal @param {[string,string]} explanation @param {[string,string]} tip
 * @param {[string,string]} measures @param {ApplicationCriterion} application @param {LessonQuestion[]} questions
 * @returns {Lesson}
 */
const lesson = (id, skill, minutes, destination, requires, title, goal, explanation, tip, measures, application, questions) => ({
  id, skill, minutes, destination, requires, title: bilingual(...title), goal: bilingual(...goal),
  explanation: bilingual(...explanation), tip: bilingual(...tip), measures: bilingual(...measures), application, questions,
});

// Helpers for "shown in practice" criteria. Only unaided evidence after the passed check counts.
/** @param {number} min @param {number} max */
const positionBetween = (min, max) => (/** @type {import('./practice-evidence.mjs').EvidenceRecord} */ row) => row.position !== undefined && row.position >= min && row.position <= max;
/** @param {string} item */
const placeOf = item => item.split('-').map(Number);
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

export const LESSON_PROGRESS_KEY = 'notanota-learning-v1';
export const LESSON_STATE_KEY = 'notanota-lesson-state-v1';
export const QUESTIONS_PER_CHECK = 2;

/** @type {Lesson[]} */
export const LEARNING_LESSONS = [
  lesson('staff-basics', 'reading', 3, 'setup', [],
    ['Porteyi tanı', 'Meet the staff'],
    ['Çizgi ve aralıkları ayırt et.', 'Distinguish lines from spaces.'],
    ['Porte beş çizgiden oluşur. Çizgiler aşağıdan yukarı sayılır. Nota başı çizginin tam üzerindeyse çizgi notası, iki çizgi arasındaysa aralık notasıdır. Sol anahtarında yukarı hareket eden doğal notalar daha ince sesleri gösterir.', 'A staff has five lines, counted from bottom to top. A notehead centred on a line is a line note; between lines it is a space note. In treble clef, ascending natural notes represent higher pitches.'],
    ['Önce nota başının merkezine bak; sapın uzunluğu sesin yüksekliğini belirlemez.', 'Look at the centre of the notehead. Stem length does not determine pitch.'],
    ['Sol anahtarında porte içindeki notaları tanıma', 'Naming treble-clef notes within the staff'],
    { filter: { module: 'reading', clef: 'treble' }, predicate: positionBetween(0, 8), minAttempts: 10, minAccuracy: 0.8 }, [
      question('Porte kaç çizgiden oluşur?', 'How many lines does a staff have?', ['Dört', 'Beş', 'Altı'], ['Four', 'Five', 'Six'], 1, 'Beş çizgi ve bu çizgiler arasında dört aralık vardır.', 'There are five lines and four spaces between them.'),
      question('Bir notanın portedeki yerini hangi bölüm belirler?', 'Which part determines a note’s staff position?', ['Sapın ucu', 'Nota başının merkezi', 'Bayrağın yönü'], ['Stem tip', 'Centre of the notehead', 'Flag direction'], 1, 'Nota başının merkezinin çizgiye veya aralığa göre konumuna bakılır.', 'Read the centre of the notehead relative to the staff lines.'),
      question('Porte çizgilerinin arasında kaç aralık vardır?', 'How many spaces lie between the staff lines?', ['Üç', 'Dört', 'Beş'], ['Three', 'Four', 'Five'], 1, 'Beş çizginin arasında dört aralık oluşur.', 'Five lines create four spaces between them.'),
      question('Sol anahtarında portede yukarı doğru ilerleyen doğal notalar nasıl sesler gösterir?', 'In treble clef, what do natural notes moving up the staff represent?', ['Daha kalın sesler', 'Daha ince sesler', 'Aynı ses'], ['Lower pitches', 'Higher pitches', 'The same pitch'], 1, 'Portede yukarı çıkmak daha ince (yüksek) bir ses demektir.', 'Moving up the staff means a higher pitch.'),
    ]),
  lesson('treble-anchors', 'reading', 4, 'setup', ['staff-basics'],
    ['Referans notalar', 'Anchor notes'],
    ['Sol anahtarında Mi ve Sol konumlarını kullan.', 'Use E and G as treble-clef anchors.'],
    ['Sol anahtarında en alt çizgi Mi, alttan ikinci çizgi Sol’dür. Bu iki çizgi arasındaki aralık Fa’dır. Komşu çizgi ve aralıklara geçerken doğal nota sırası Do–Re–Mi–Fa–Sol–La–Si olarak ilerler.', 'In treble clef, the bottom line is E and the second line is G. The space between them is F. Moving to a neighbouring line or space advances one letter in C–D–E–F–G–A–B order.'],
    ['Her soruda baştan saymak yerine bildiğin en yakın referans notadan ilerle.', 'Start from the nearest anchor you know rather than recounting the entire staff.'],
    ['Referans notalardan hareketle porte içi notaları hızlıca bulma', 'Finding staff notes quickly from anchor notes'],
    { filter: { module: 'reading', clef: 'treble' }, predicate: positionBetween(0, 8), minAttempts: 12, minAccuracy: 0.85 }, [
      question('Sol anahtarında en alt çizgide hangi nota bulunur?', 'Which note is on the bottom line in treble clef?', ['Do', 'Mi', 'Sol'], ['C', 'E', 'G'], 1, 'En alt çizgi Mi’dir.', 'The bottom line is E.'),
      question('En alt iki çizgi arasındaki aralık hangi notadır?', 'Which note occupies the space between the lowest two lines?', ['Fa', 'La', 'Re'], ['F', 'A', 'D'], 0, 'Mi ile Sol arasındaki doğal nota Fa’dır.', 'F lies between E and G.'),
      question('Sol anahtarında alttan ikinci çizgi hangi notadır?', 'Which note is on the second line from the bottom in treble clef?', ['Fa', 'Sol', 'Si'], ['F', 'G', 'B'], 1, 'Sol anahtarı bu çizgiyi sarar: alttan ikinci çizgi Sol’dür.', 'The treble clef curls around this line: the second line is G.'),
      question('Sol anahtarında orta (üçüncü) çizgi hangi notadır?', 'Which note is on the middle (third) line in treble clef?', ['La', 'Si', 'Do'], ['A', 'B', 'C'], 1, 'Çizgiler aşağıdan Mi–Sol–Si–Re–Fa diye sıralanır; ortadaki Si’dir.', 'The lines from the bottom are E–G–B–D–F; the middle one is B.'),
    ]),
  lesson('ledger-lines', 'reading', 4, 'setup', ['treble-anchors'],
    ['Ek çizgilerde yön bul', 'Find your way on ledger lines'],
    ['Portenin hemen dışındaki notaları tanı.', 'Recognise notes immediately outside the staff.'],
    ['Ek çizgiler, portenin altına ve üstüne eklenen kısa çizgilerdir. Sol anahtarında portenin altındaki ilk ek çizgi Do4’tür; bununla en alt porte çizgisi Mi4 arasındaki aralık Re4’tür. Portenin en üst çizgisi Fa5, üstündeki aralık Sol5 ve ilk üst ek çizgi La5’tir.', 'Ledger lines extend the staff with short lines. In treble clef, the first ledger line below is C4; the space between it and the bottom staff line E4 is D4. The top staff line is F5, the space above is G5, and the first ledger line above is A5.'],
    ['Alt ve üst ek çizgileri ayrı çalış. Önce ilk ek çizgiyi öğren, sonra kapsamı genişlet.', 'Practise lower and upper ledger lines separately. Start with the first ledger line before expanding.'],
    ['Portenin altında ve üstündeki notaları okuma', 'Reading notes below and above the staff'],
    { filter: { module: 'reading' }, predicate: row => row.position !== undefined && (row.position <= -1 || row.position >= 9), minAttempts: 8, minAccuracy: 0.8 }, [
      question('Sol anahtarında portenin altındaki ilk ek çizgi hangi notadır?', 'What is the first ledger line below a treble staff?', ['Do4', 'Re4', 'Mi4'], ['C4', 'D4', 'E4'], 0, 'İlk alt ek çizgi orta Do, yani Do4’tür.', 'The first lower ledger line is middle C, C4.'),
      question('Sol anahtarında portenin üstündeki ilk ek çizgi hangi notadır?', 'What is the first ledger line above a treble staff?', ['Sol5', 'La5', 'Si5'], ['G5', 'A5', 'B5'], 1, 'Üst çizgi Fa5, üstündeki aralık Sol5, ilk ek çizgi La5’tir.', 'The top line is F5, followed by space G5 and ledger-line A5.'),
      question('İlk alt ek çizgi ile en alt porte çizgisi arasındaki aralık hangi notadır?', 'Which note is in the space between the first lower ledger line and the bottom staff line?', ['Do4', 'Re4', 'Fa4'], ['C4', 'D4', 'F4'], 1, 'Do4 ile Mi4 arasındaki aralık Re4’tür.', 'The space between C4 and E4 holds D4.'),
      question('Sol anahtarında en üst porte çizgisinin hemen üstündeki aralık hangi notadır?', 'In treble clef, which note sits in the space just above the top staff line?', ['Fa5', 'Sol5', 'La5'], ['F5', 'G5', 'A5'], 1, 'Üst çizgi Fa5 olduğundan hemen üstündeki aralık Sol5’tir.', 'The top line is F5, so the space above it is G5.'),
    ]),
  lesson('octaves', 'reading', 3, 'setup', ['treble-anchors'],
    ['Aynı ad, farklı oktav', 'Same name, different octave'],
    ['Nota adıyla ses yüksekliğini birbirinden ayır.', 'Distinguish a note name from an exact pitch.'],
    ['Do–Re–Mi–Fa–Sol–La–Si dizisinden sonra nota adları yeniden başlar. Do4 ve Do5 aynı adı taşır, fakat Do5 bir oktav daha incedir. Sadece Do adını bilmek her zaman hangi sesi çalacağını belirlemeye yetmez.', 'Note names repeat after C–D–E–F–G–A–B. C4 and C5 share a name, but C5 is one octave higher. Knowing only the letter C does not always identify the exact pitch to play.'],
    ['Gitarda aynı adlı bütün yerleri değil, sorulan ses yüksekliğine uyan yerleri ara.', 'On guitar, look for the requested exact pitch, not every fret sharing its letter name.'],
    ['Yazılı notayı enstrümanda doğru oktavda bulma', 'Finding a written note in the right octave on an instrument'],
    { filter: { module: ['guitar', 'piano'], task: ['staff-to-fretboard', 'staff-to-location', 'locate'] }, minAttempts: 8, minAccuracy: 0.8 }, [
      question('Do4 ile Do5 aynı ses yüksekliğinde midir?', 'Are C4 and C5 the same pitch?', ['Evet', 'Hayır, Do5 daha incedir', 'Hayır, Do4 daha incedir'], ['Yes', 'No, C5 is higher', 'No, C4 is higher'], 1, 'Do5, Do4’ün bir oktav üstündedir.', 'C5 is one octave above C4.'),
      question('Si’den sonra yukarı doğru hangi doğal nota adı gelir?', 'Which natural note name follows B upwards?', ['La', 'Re', 'Do'], ['A', 'D', 'C'], 2, 'Nota adları Do ile yeni oktavda tekrar başlar.', 'The note names restart at C in the next octave.'),
      question('Do4’ün bir oktav altındaki Do hangisidir?', 'Which C is one octave below C4?', ['Do3', 'Do5', 'Si3'], ['C3', 'C5', 'B3'], 0, 'Oktav numarası bir azalınca aynı ad bir oktav aşağıda tekrar eder.', 'Lowering the octave number by one gives the same name an octave lower.'),
      question('Bir oktav kaç yarım sesten oluşur?', 'How many semitones make one octave?', ['7', '8', '12'], ['7', '8', '12'], 2, 'Yedi doğal nota ve aralarındaki siyah tuşlarla birlikte on iki yarım ses vardır.', 'Counting black keys between the seven naturals, an octave has twelve semitones.'),
    ]),
  lesson('pulse-tempo', 'rhythm', 3, 'pieces', [],
    ['Vuruşu sabit tut', 'Keep a steady pulse'],
    ['Tempo ile nota süresinin farkını anla.', 'Distinguish tempo from note duration.'],
    ['Tempo, seçilen vuruş biriminin bir dakikada kaç kez gerçekleştiğini söyler. Dörtlük = 60 BPM ise her dörtlük vuruş bir saniyedir. Daha kısa notalara geçtiğinde ana vuruş hızlanmaz; vuruşun içine daha fazla nota yerleşir.', 'Tempo states how many selected beat units occur per minute. At quarter note = 60 BPM, each quarter-note beat lasts one second. Shorter notes do not speed up the main pulse; more notes fit inside each beat.'],
    ['Önce sadece metronomla eşit aralıklarda vur. Nota adlarını bundan sonra ekle.', 'First tap evenly with the metronome. Add pitch reading afterwards.'],
    ['Ritimli okumada notayı kendi süresi içinde cevaplama', 'Answering each note within its duration in rhythm reading'],
    { filter: { module: 'score' }, predicate: row => row.timeLimitMs !== null && !row.task.startsWith('rest') && row.task !== 'entry-after-rest', minAttempts: 16, minAccuracy: 0.75 }, [
      question('Dörtlük = 60 BPM iken iki vuruş arası kaç saniyedir?', 'At quarter note = 60 BPM, how long is one beat?', ['Yarım saniye', 'Bir saniye', 'İki saniye'], ['Half a second', 'One second', 'Two seconds'], 1, '60 saniyede 60 vuruş: vuruş başına bir saniye.', '60 beats in 60 seconds means one second per beat.'),
      question('Onaltılıklara geçince ana metronom vuruşu ne yapar?', 'What happens to the main metronome pulse during sixteenth notes?', ['Hızlanır', 'Durur', 'Aynı tempoda sürer'], ['Speeds up', 'Stops', 'Keeps the same tempo'], 2, 'Nota bölünmeleri değişir; seçilen tempo aynı kalır.', 'The subdivisions change; the chosen tempo stays the same.'),
      question('Dörtlük = 120 BPM iken bir vuruş ne kadar sürer?', 'At quarter note = 120 BPM, how long does one beat last?', ['Yarım saniye', 'Bir saniye', 'İki saniye'], ['Half a second', 'One second', 'Two seconds'], 0, '60 saniyede 120 vuruş: vuruş başına yarım saniye.', '120 beats in 60 seconds means half a second per beat.'),
      question('Tempoyu 60’tan 90 BPM’e çıkarırsan iki vuruş arasındaki süre ne olur?', 'If you raise the tempo from 60 to 90 BPM, what happens to the time between beats?', ['Kısalır', 'Uzar', 'Değişmez'], ['It gets shorter', 'It gets longer', 'It stays the same'], 0, 'Dakikada daha çok vuruş, her vuruşa daha kısa süre demektir.', 'More beats per minute means less time per beat.'),
    ]),
  lesson('note-values', 'rhythm', 4, 'pieces', ['pulse-tempo'],
    ['Uzun ve kısa notalar', 'Long and short notes'],
    ['Dörtlük vuruşa göre temel süreleri karşılaştır.', 'Compare basic durations using a quarter-note beat.'],
    ['Dörtlük bir vuruş kabul edildiğinde birlik dört, ikilik iki, dörtlük bir vuruş sürer. İkilik nota boş başlı ve saplıdır; birlik boş başlı ve sapsızdır. Nota süresi ile sesin inceliği farklı bilgilerdir.', 'With a quarter-note beat, a whole note lasts four beats, a half note two, and a quarter note one. Half notes have an open head and a stem; whole notes have an open head without a stem. Duration and pitch are separate properties.'],
    ['Uzun notada da içinden vuruşları saymaya devam et.', 'Keep counting the pulse internally during long notes.'],
    ['Birlik, ikilik ve dörtlük notaları süresi içinde okuma', 'Reading whole, half and quarter notes within their duration'],
    { filter: { module: 'score', rhythm: ['whole', 'half', 'quarter'] }, predicate: row => row.timeLimitMs !== null && !row.task.startsWith('rest'), minAttempts: 12, minAccuracy: 0.8 }, [
      question('Dörtlük bir vuruşsa birlik kaç vuruştur?', 'If a quarter note is one beat, how many beats is a whole note?', ['Bir', 'İki', 'Dört'], ['One', 'Two', 'Four'], 2, 'Bir birlik, dört dörtlük süresine eşittir.', 'One whole note lasts as long as four quarter notes.'),
      question('Boş başlı ve saplı temel nota değeri hangisidir?', 'Which basic note value has an open head and a stem?', ['İkilik', 'Dörtlük', 'Birlik'], ['Half note', 'Quarter note', 'Whole note'], 0, 'İkilik boş başlı ve saplı; birlik sapsızdır.', 'A half note has an open head and a stem; a whole note has no stem.'),
      question('Bir ikilik kaç dörtlüğe eşittir?', 'How many quarter notes equal one half note?', ['Bir', 'İki', 'Dört'], ['One', 'Two', 'Four'], 1, 'İkilik iki vuruş, dörtlük bir vuruştur.', 'A half note lasts two beats; a quarter lasts one.'),
      question('Boş başlı ve sapsız nota değeri hangisidir?', 'Which note value has an open head and no stem?', ['Dörtlük', 'İkilik', 'Birlik'], ['Quarter note', 'Half note', 'Whole note'], 2, 'Birlik boş başlıdır ve sapı yoktur.', 'A whole note has an open head and no stem.'),
    ]),
  lesson('subdivisions', 'rhythm', 4, 'pieces', ['note-values'],
    ['Bir vuruşun içini böl', 'Subdivide the beat'],
    ['Sekizlik, onaltılık ve üçlemeyi ayırt et.', 'Distinguish eighths, sixteenths and triplets.'],
    ['Bir dörtlük vuruşa iki eşit sekizlik veya dört eşit onaltılık sığar. Sekizlik üçlemede aynı süreye üç eşit nota yerleşir. Gruplardaki notaların sesleri farklı olabilir; birleştiren kiriş süre grubunu gösterir.', 'One quarter-note beat holds two equal eighth notes or four equal sixteenths. An eighth-note triplet fits three equal notes into that same duration. Their pitches can differ; the beam groups their rhythmic values.'],
    ['Önce tek sesle ritmi uygula; sonra aynı ritimde farklı notalar oku.', 'Practise the rhythm on one pitch first, then read different pitches using that rhythm.'],
    ['Vuruş içindeki kısa notaları süresi içinde okuma', 'Reading short notes inside the beat within their duration'],
    { filter: { module: 'score', rhythm: ['eighth', 'sixteenth', 'triplet'] }, predicate: row => row.timeLimitMs !== null, minAttempts: 12, minAccuracy: 0.75 }, [
      question('Bir dörtlük vuruşa kaç eşit onaltılık sığar?', 'How many equal sixteenth notes fit one quarter-note beat?', ['İki', 'Üç', 'Dört'], ['Two', 'Three', 'Four'], 2, 'Dört onaltılık bir dörtlük süresindedir.', 'Four sixteenths last as long as one quarter note.'),
      question('Sekizlik üçlemede bir dörtlük süreye kaç eşit nota yerleşir?', 'How many equal eighth-note triplets fit one quarter-note duration?', ['İki', 'Üç', 'Altı'], ['Two', 'Three', 'Six'], 1, 'Üçleme, aynı süreyi üç eşit parçaya böler.', 'A triplet divides that duration into three equal parts.'),
      question('İki sekizlik kaç onaltılığa eşittir?', 'How many sixteenth notes equal two eighth notes?', ['İki', 'Dört', 'Sekiz'], ['Two', 'Four', 'Eight'], 1, 'Her sekizlik iki onaltılıktır; iki sekizlik dört onaltılık eder.', 'Each eighth equals two sixteenths, so two eighths equal four.'),
      question('Kısa notaları bir vuruş içinde birleştiren yatay çizginin adı nedir?', 'What is the horizontal line joining short notes within a beat called?', ['Kiriş', 'Bağ', 'Ek çizgi'], ['Beam', 'Tie', 'Ledger line'], 0, 'Kiriş, aynı vuruştaki sekizlik veya onaltılıkları gruplar.', 'A beam groups eighths or sixteenths within the same beat.'),
    ]),
  lesson('rests-measures', 'rhythm', 4, 'pieces', ['note-values'],
    ['Sus ve ölçü', 'Rests and measures'],
    ['Sessizlikte de vuruşun sürdüğünü kavra.', 'Understand that the pulse continues during silence.'],
    ['Sus işareti, belirtilen süre boyunca yeni nota çalmamayı anlatır; zaman akmaya devam eder. 4/4 ölçüde bir ölçü dört dörtlük vuruş içerir. Nota ve sus süreleri birlikte ölçüyü doldurur. Eser okumadaki suslu etütlerde, susu sessizce sayıp sonraki notaya zamanında girmeyi çalışabilirsin.', 'A rest indicates silence for its duration; time continues. A 4/4 measure contains four quarter-note beats. Notes and rests together fill the measure. In the score-reading studies with rests, practise counting the silence and entering the next note on time.'],
    ['Sus sırasında da vuruşu içinden say; sonraki giriş yerini önceden düşün.', 'Count internally during a rest and anticipate the next entry.'],
    ['Ritimli etütlerde susları sessiz tutma', 'Keeping rests silent in rhythmic studies'],
    { filter: { module: 'score', task: 'rest-rhythm' }, minAttempts: 6, minAccuracy: 0.75 }, [
      question('4/4 ölçüde iki dörtlük ve bir ikilik toplam kaç ölçü doldurur?', 'In 4/4, two quarters and one half note fill how many measures?', ['Yarım', 'Bir', 'İki'], ['Half', 'One', 'Two'], 1, '1 + 1 + 2 = 4 dörtlük vuruş, yani bir ölçü.', '1 + 1 + 2 = 4 quarter-note beats, one measure.'),
      question('Sus sırasında metronomun vuruşu devam eder mi?', 'Does the metronome pulse continue during a rest?', ['Evet', 'Hayır', 'Yalnız hızlı tempoda'], ['Yes', 'No', 'Only at fast tempos'], 0, 'Sessizlik de ölçülen bir müzik süresidir.', 'Silence also occupies measured musical time.'),
      question('4/4 ölçüde bir ikilik sus kaç vuruş sürer?', 'In 4/4, how many beats does a half rest last?', ['Bir', 'İki', 'Dört'], ['One', 'Two', 'Four'], 1, 'İkilik sus, ikilik nota gibi iki vuruş sürer.', 'A half rest lasts two beats, like a half note.'),
      question('Bir ölçüde üç dörtlük nota var. 4/4’ü tamamlamak için ne gerekir?', 'A bar holds three quarter notes. What completes the 4/4 bar?', ['Dörtlük sus', 'İkilik sus', 'Birlik sus'], ['A quarter rest', 'A half rest', 'A whole rest'], 0, '3 vuruş + 1 vuruşluk sus = 4 vuruş.', '3 beats + a one-beat rest = 4 beats.'),
    ]),
  lesson('accidentals', 'reading', 4, 'setup', ['treble-anchors'],
    ['Diyez, bemol, natürel', 'Sharps, flats and naturals'],
    ['Değiştirme işaretlerinin etkisini öğren.', 'Learn what accidentals change.'],
    ['Diyez (♯) notayı yarım ses yükseltir; bemol (♭) yarım ses alçaltır. Natürel (♮) ilgili değişikliği kaldırır. İşaret, nota adını başka bir harfe dönüştürmez: Fa diyez yine Fa adıyla yazılır. Enstrümandaki ses ile portedeki yazılış birlikte değerlendirilir.', 'A sharp (♯) raises a note by a semitone; a flat (♭) lowers it by a semitone. A natural (♮) cancels an alteration. The letter stays the same: F sharp is still written as F. Consider both the sounding pitch and its written spelling.'],
    ['Önce nota başının yerini, sonra değiştirme işaretini oku.', 'Read the notehead position first, then its accidental.'],
    ['Diyez ve bemollü notaları yazıldığı gibi adlandırma', 'Naming sharp and flat notes as written'],
    { filter: { module: 'reading' }, predicate: row => row.accidental !== undefined && row.accidental !== 0, minAttempts: 10, minAccuracy: 0.8 }, [
      question('Bemol bir doğal notayı nasıl değiştirir?', 'How does a flat change a natural note?', ['Yarım ses alçaltır', 'Yarım ses yükseltir', 'Bir oktav yükseltir'], ['Lowers by a semitone', 'Raises by a semitone', 'Raises by an octave'], 0, 'Bemol yarım ses alçaltır.', 'A flat lowers by one semitone.'),
      question('Fa diyez yazılırken temel harf adı değişir mi?', 'Does the underlying letter change when F becomes F sharp?', ['Evet, Sol olur', 'Hayır, Fa olarak kalır', 'Evet, Mi olur'], ['Yes, it becomes G', 'No, it stays F', 'Yes, it becomes E'], 1, 'Değiştirme işareti ses yüksekliğini değiştirir; harf Fa olarak kalır.', 'The accidental alters the pitch; the letter remains F.'),
      question('Diyez bir notayı nasıl değiştirir?', 'How does a sharp change a note?', ['Yarım ses yükseltir', 'Yarım ses alçaltır', 'Değiştirmez'], ['Raises it by a semitone', 'Lowers it by a semitone', 'No change'], 0, 'Diyez notayı yarım ses yükseltir.', 'A sharp raises the note by a semitone.'),
      question('Natürel (♮) işareti ne yapar?', 'What does a natural sign (♮) do?', ['Önceki diyez veya bemolü kaldırır', 'Notayı bir oktav yükseltir', 'Notayı susturur'], ['Cancels an earlier sharp or flat', 'Raises the note an octave', 'Silences the note'], 0, 'Natürel, geçerli değiştirme işaretini iptal eder.', 'A natural cancels the alteration in effect.'),
    ]),
  lesson('bass-clef', 'reading', 4, 'setup', ['treble-anchors'],
    ['Fa anahtarına giriş', 'Meet the bass clef'],
    ['Anahtar değişince nota yerlerinin değiştiğini fark et.', 'Recognise that a clef changes note-position meanings.'],
    ['Fa anahtarının iki noktası, alttan dördüncü çizgideki Fa3’ü çevreler. En alt çizgi Sol2’dir. Sol anahtarında öğrendiğin çizgi adlarını fa anahtarına aynen taşıyamazsın: okumadan önce anahtarı kontrol et.', 'The two dots of the bass clef surround F3 on the fourth line from the bottom. Its bottom line is G2. Treble-clef line names do not carry over unchanged: check the clef before reading.'],
    ['Yeni anahtarda küçük bir aralıkla başla; iki anahtarı hemen karıştırmak zorunda değilsin.', 'Begin with a small range in the new clef; you do not need to mix both clefs immediately.'],
    ['Fa anahtarındaki notaları sol anahtarıyla karıştırmadan okuma', 'Reading bass-clef notes without mixing them up with treble'],
    { filter: { module: 'reading', clef: 'bass' }, minAttempts: 12, minAccuracy: 0.8 }, [
      question('Fa anahtarında en alt çizgi hangi notadır?', 'What is the bottom line in bass clef?', ['Mi2', 'Sol2', 'Fa3'], ['E2', 'G2', 'F3'], 1, 'Fa anahtarında en alt çizgi Sol2’dir.', 'The bottom line in bass clef is G2.'),
      question('Fa anahtarının iki noktası hangi çizgiyi çevreler?', 'Which line do the bass-clef dots surround?', ['Alttan ikinci', 'Alttan üçüncü', 'Alttan dördüncü'], ['Second from bottom', 'Third from bottom', 'Fourth from bottom'], 2, 'Alttan dördüncü çizgi Fa3’tür.', 'The fourth line from the bottom is F3.'),
      question('Fa anahtarında en üst çizgi hangi notadır?', 'What is the top line in bass clef?', ['Fa3', 'La3', 'Do4'], ['F3', 'A3', 'C4'], 1, 'Fa anahtarının çizgileri aşağıdan Sol–Si–Re–Fa–La’dır.', 'Bass-clef lines from the bottom are G–B–D–F–A.'),
      question('Fa anahtarında orta çizgi hangi notadır?', 'What is the middle line in bass clef?', ['Re3', 'Si2', 'Mi3'], ['D3', 'B2', 'E3'], 0, 'Sol2, Si2, Re3, Fa3, La3: ortadaki Re3’tür.', 'G2, B2, D3, F3, A3: the middle line is D3.'),
    ]),
  lesson('guitar-map', 'guitar', 5, 'guitar', ['octaves'],
    ['Porteden gitara', 'From staff to guitar'],
    ['Tel, perde ve aynı sesin farklı konumlarını ayırt et.', 'Distinguish strings, frets and alternative locations for the same pitch.'],
    ['Standart akortta 1. tel en ince Mi, 6. tel en kalın Mi telidir. Boş tel, hiçbir perdeye basmadan çalınır. Her perde sesi yarım ses yükseltir. Aynı ses birden fazla tel–perde birleşiminde bulunabilir. Gitarın sol anahtarlı yazımı, duyulan sesten bir oktav yukarıdadır.', 'In standard tuning, string 1 is the highest E string and string 6 the lowest E string. An open string is played without fretting. Each fret raises pitch by a semitone. The same pitch can occur on several string–fret combinations. Guitar treble notation is written one octave above its sounding pitch.'],
    ['Bir konumu bulduğunda durma: çalışma birden fazla konum istiyorsa aynı ses yüksekliğini diğer tellerde de ara.', 'After finding one location, look on other strings for the same exact pitch if the exercise asks for multiple locations.'],
    ['Gitar klavyesindeki konumları adlandırma ve bulma', 'Naming and finding guitar fretboard locations'],
    { filter: { module: 'guitar' }, minAttempts: 12, minAccuracy: 0.8 }, [
      question('Boş tel ne demektir?', 'What is an open string?', ['Hiçbir perdeye basmadan çalınan tel', 'En yüksek perde', 'Sesi olmayan tel'], ['A string played without fretting', 'The highest fret', 'A string with no sound'], 0, 'Boş telde sol el bir perdeye basmaz.', 'An open string is not stopped at a fret.'),
      question('Standart akortta 2. tel 5. perde ile 1. boş tel aynı sesi verir mi?', 'In standard tuning, do string 2 fret 5 and open string 1 sound the same pitch?', ['Evet, ikisi de Mi4', 'Hayır, bir oktav farklı', 'Hayır, farklı nota adları'], ['Yes, both are E4', 'No, one octave apart', 'No, different note names'], 0, 'Si3 telinde beş yarım ses yükselince Mi4 elde edilir.', 'Raising the B3 string by five semitones gives E4.'),
      question('Standart akortta 6. telin boş sesi nedir?', 'What does open string 6 sound in standard tuning?', ['Mi2', 'La2', 'Mi4'], ['E2', 'A2', 'E4'], 0, 'En kalın tel Mi2’dir; 1. tel iki oktav yukarıdaki Mi4’tür.', 'The lowest string is E2; string 1 is E4, two octaves higher.'),
      question('Bir perde yukarı çıkmak sesi ne kadar değiştirir?', 'How much does moving up one fret change the pitch?', ['Yarım ses', 'Tam ses', 'Bir oktav'], ['A semitone', 'A whole tone', 'An octave'], 0, 'Gitarda her perde bir yarım sestir.', 'On guitar, each fret is one semitone.'),
    ]),
  lesson('piano-map', 'piano', 4, 'piano', ['octaves'],
    ['Tuşlarda yön bul', 'Find your way on the keys'],
    ['Siyah tuş gruplarından Do ve Fa’yı bul.', 'Find C and F from the black-key groups.'],
    ['Piyanoda siyah tuşlar ikili ve üçlü gruplar hâlinde tekrarlanır. İkili siyah tuş grubunun hemen solundaki beyaz tuş Do, üçlü grubun hemen solundaki beyaz tuş Fa’dır. Sağa ilerledikçe sesler incelir. Ekrandaki tuşu tanımak, gerçek piyanoda el tekniğini değerlendirmez.', 'Black keys repeat in groups of two and three. The white key immediately left of a two-black-key group is C; immediately left of a three-black-key group is F. Pitch rises to the right. Recognising an on-screen key does not assess physical piano technique.'],
    ['Önce Do’ları bul, sonra çevresindeki beyaz tuşları adlandır.', 'Find the Cs first, then name the neighbouring white keys.'],
    ['Piyano tuşlarını adlandırma ve yazılı notayı tuşta bulma', 'Naming piano keys and finding written notes on them'],
    { filter: { module: 'piano' }, minAttempts: 10, minAccuracy: 0.8 }, [
      question('İkili siyah tuş grubunun hemen solundaki beyaz tuş hangisidir?', 'Which white key is immediately left of a two-black-key group?', ['Fa', 'Do', 'Si'], ['F', 'C', 'B'], 1, 'İkili grubun hemen solundaki tuş Do’dur.', 'C is immediately left of the two-black-key group.'),
      question('Piyanoda sağa ilerledikçe ses nasıl değişir?', 'What happens to pitch as you move right on a piano?', ['Kalınlaşır', 'Değişmez', 'İncelir'], ['Gets lower', 'Stays the same', 'Gets higher'], 2, 'Sağdaki tuşlar daha ince sesler üretir.', 'Keys further right produce higher pitches.'),
      question('Üçlü siyah tuş grubunun hemen solundaki beyaz tuş hangisidir?', 'Which white key is immediately left of a three-black-key group?', ['Fa', 'Sol', 'Do'], ['F', 'G', 'C'], 0, 'Üçlü grubun hemen solundaki tuş Fa’dır.', 'F is immediately left of the three-black-key group.'),
      question('Do ile Re arasındaki siyah tuşun iki adı nedir?', 'What are the two names of the black key between C and D?', ['Do♯ ve Re♭', 'Re♯ ve Mi♭', 'Do♭ ve Si♯'], ['C♯ and D♭', 'D♯ and E♭', 'C♭ and B♯'], 0, 'Aynı tuş, Do’dan yarım ses yukarı veya Re’den yarım ses aşağı olarak adlandırılabilir.', 'The same key is a semitone above C or a semitone below D.'),
    ]),
  lesson('dotted-notes', 'rhythm', 4, 'pieces', ['subdivisions', 'rests-measures'],
    ['Noktalı notalar ve 3/4', 'Dotted notes and 3/4'],
    ['Noktanın süreye etkisini ve üç vuruşluk ölçüyü öğren.', 'Learn what a dot adds and how a three-beat bar works.'],
    ['Nota başının yanındaki nokta, notaya kendi süresinin yarısını ekler: noktalı dörtlük bir buçuk, noktalı ikilik üç vuruş sürer. Noktalı dörtlükten sonra gelen sekizlik vuruşun ikinci yarısında başlar. 3/4 ölçüde her ölçü üç dörtlük vuruş içerir; ilk vuruş genellikle vurgulu hissedilir.', 'A dot beside a notehead adds half of the note’s own value: a dotted quarter lasts one and a half beats and a dotted half three beats. The eighth after a dotted quarter starts on the second half of a beat. In 3/4 each bar holds three quarter-note beats; the first usually feels strongest.'],
    ['Noktalı dörtlükte “bir-ve-iki” diye sayıp sekizliği “ve”ye yerleştir.', 'Count “one-and-two” across a dotted quarter and place the eighth on the “and”.'],
    ['Noktalı dörtlükleri ritimli etütte zamanında okuma', 'Reading dotted quarters on time in a rhythmic study'],
    { filter: { module: 'score', rhythm: 'dottedQuarter' }, predicate: row => row.timeLimitMs !== null, minAttempts: 4, minAccuracy: 0.75 }, [
      question('Dörtlük bir vuruşsa noktalı dörtlük kaç vuruş sürer?', 'If a quarter note is one beat, how long is a dotted quarter?', ['Bir', 'Bir buçuk', 'İki'], ['One', 'One and a half', 'Two'], 1, 'Nokta yarım vuruş ekler: 1 + ½.', 'The dot adds half a beat: 1 + ½.'),
      question('Noktalı ikilik kaç vuruştur?', 'How many beats is a dotted half note?', ['İki', 'Üç', 'Dört'], ['Two', 'Three', 'Four'], 1, '2 vuruş + yarısı olan 1 vuruş = 3.', '2 beats plus half of that, 1 beat, equals 3.'),
      question('3/4 ölçüde bir ölçü kaç dörtlük vuruştur?', 'How many quarter-note beats are in a 3/4 bar?', ['İki', 'Üç', 'Dört'], ['Two', 'Three', 'Four'], 1, 'Üstteki sayı vuruş sayısını, alttaki 4 vuruş birimini (dörtlük) gösterir.', 'The top number gives the beats; the bottom 4 names the quarter note as the beat.'),
      question('Noktalı dörtlük ve bir sekizlik birlikte kaç vuruş doldurur?', 'How many beats do a dotted quarter and an eighth fill together?', ['Bir buçuk', 'İki', 'Üç'], ['One and a half', 'Two', 'Three'], 1, '1½ + ½ = 2 vuruş.', '1½ + ½ = 2 beats.'),
    ]),
  lesson('rest-entries', 'rhythm', 3, 'pieces', ['rests-measures'],
    ['Sustan sonra zamanında gir', 'Enter on time after a rest'],
    ['Sessizliği sayıp sonraki notayı erken veya geç başlatmamayı çalış.', 'Count the silence and start the next note neither early nor late.'],
    ['Sus bir boşluk değil, sayılan bir süredir. Sustan sonraki nota, susun süresi bittiği anda başlar. Erken basmak susu kısaltır, geç basmak sonraki notayı kısaltır. Suslu etütlerde uygulama sonucu nota adlarından ayrı olarak “sus sonrası zamanında giriş” diye raporlanır.', 'A rest is a counted duration, not a gap. The note after a rest begins exactly when the rest ends. Pressing early shortens the rest; pressing late shortens the next note. In studies with rests, results report “on-time entries after rests” separately from note names.'],
    ['Susun son vuruşunda sonraki notanın adını zihninde hazırla; tuşa vuruş gelince bas.', 'Prepare the next note’s name during the last beat of the rest; press as the beat arrives.'],
    ['Suslardan sonra notaya zamanında girme', 'Entering on time after rests'],
    { filter: { module: 'score', task: 'entry-after-rest' }, minAttempts: 5, minAccuracy: 0.75 }, [
      question('Dörtlük sustan sonraki nota ne zaman başlar?', 'When does the note after a quarter rest begin?', ['Sus biter bitmez', 'Susun ortasında', 'Bir vuruş sonra'], ['As soon as the rest ends', 'In the middle of the rest', 'One beat later'], 0, 'Sus kendi süresini doldurur, sonra nota başlar.', 'The rest fills its duration, then the note starts.'),
      question('Susta erken basmak neye yol açar?', 'What does pressing early during a rest do?', ['Susu kısaltır', 'Susu uzatır', 'Tempoyu yavaşlatır'], ['Shortens the rest', 'Lengthens the rest', 'Slows the tempo'], 0, 'Erken giriş, sessizliğin süresini eksik bırakır.', 'An early entry leaves the silence incomplete.'),
      question('4/4 ölçüde ikilik sus ilk iki vuruşu kaplıyorsa ilk nota hangi vuruşta başlar?', 'In 4/4, if a half rest covers beats 1–2, on which beat does the first note begin?', ['2. vuruş', '3. vuruş', '4. vuruş'], ['Beat 2', 'Beat 3', 'Beat 4'], 1, 'İki vuruşluk sustan sonra 3. vuruş gelir.', 'After a two-beat rest comes beat 3.'),
      question('Sus sırasında vuruşu saymaya devam etmek neden önemlidir?', 'Why keep counting the beat during a rest?', ['Sonraki girişi doğru zamanda yapmak için', 'Sesi yükseltmek için', 'Tempoyu değiştirmek için'], ['To make the next entry on time', 'To play louder', 'To change the tempo'], 0, 'Sayım durursa giriş zamanı kayar.', 'If counting stops, the entry drifts.'),
    ]),
  lesson('key-signatures', 'reading', 5, 'pieces', ['accidentals'],
    ['Donanımı oku', 'Read the key signature'],
    ['Anahtarın yanındaki diyez ve bemollerin bütün satıra etkisini öğren.', 'Learn how sharps and flats beside the clef affect the whole line.'],
    ['Donanım, anahtarın hemen sağına yazılan diyez veya bemollerdir. Bir diyez (Fa♯) Sol majörü, bir bemol (Si♭) Fa majörü gösterir. Donanımdaki işaret, o harfin bütün oktavlardaki notalarını satır boyunca etkiler. Nota başının önüne yazılan değiştirici ise yalnız o ölçü sonuna kadar geçerlidir.', 'The key signature is the set of sharps or flats written right after the clef. One sharp (F♯) indicates G major; one flat (B♭) indicates F major. A key-signature sign affects that letter in every octave for the whole line. An accidental written before a notehead lasts only until the bar line.'],
    ['Satıra başlamadan önce donanımdaki harfleri söyle; sonra o harfleri görünce işareti ekle.', 'Name the key-signature letters before you start; add the sign whenever those letters appear.'],
    ['Donanımlı etütlerde etkilenen notaları doğru adlandırma', 'Naming the affected notes correctly in studies with a key signature'],
    { filter: { module: 'score' }, predicate: row => row.keySignature !== undefined && row.keySignature !== 0 && row.accidental !== undefined && row.accidental !== 0, minAttempts: 6, minAccuracy: 0.8 }, [
      question('Donanımda tek diyez varsa bu hangi notadır?', 'If the key signature has one sharp, which note is it?', ['Fa♯', 'Do♯', 'Sol♯'], ['F♯', 'C♯', 'G♯'], 0, 'Diyezler Fa–Do–Sol–Re–La–Mi–Si sırasıyla eklenir; ilki Fa♯’dir.', 'Sharps are added in the order F–C–G–D–A–E–B; the first is F♯.'),
      question('Donanımda tek bemol varsa bu hangi notadır?', 'If the key signature has one flat, which note is it?', ['Mi♭', 'Si♭', 'La♭'], ['E♭', 'B♭', 'A♭'], 1, 'Bemoller Si–Mi–La–Re–Sol–Do–Fa sırasıyla eklenir; ilki Si♭’dir.', 'Flats are added in the order B–E–A–D–G–C–F; the first is B♭.'),
      question('Donanımdaki Fa♯, farklı oktavdaki bir Fa’yı da etkiler mi?', 'Does an F♯ in the key signature also affect an F in another octave?', ['Evet', 'Hayır', 'Yalnız ilk ölçüde'], ['Yes', 'No', 'Only in the first bar'], 0, 'Donanım, harfin bütün oktavlarını satır boyunca etkiler.', 'A key signature affects that letter in every octave throughout the line.'),
      question('Ölçü içinde yazılan bir değiştirici ne zamana kadar geçerlidir?', 'How long does an accidental written inside a bar last?', ['Ölçü sonuna kadar', 'Satır sonuna kadar', 'Yalnız o notada'], ['Until the bar line', 'Until the end of the line', 'Only for that note'], 0, 'Aynı konumdaki sonraki notaları ölçü çizgisine kadar etkiler.', 'It affects later notes at the same position until the bar line.'),
    ]),
  lesson('guitar-first-position', 'guitar', 5, 'guitar', ['guitar-map'],
    ['Gitarda birinci pozisyon', 'First position on guitar'],
    ['İlk üç perdedeki doğal notaları tel tel öğren.', 'Learn the natural notes in the first three frets, string by string.'],
    ['Birinci pozisyonda boş tellerle ilk üç perdeyi kullanırsın. 6. telde Fa (1. perde) ve Sol (3. perde), 5. telde Si (2) ve Do (3), 4. telde Mi (2) ve Fa (3), 3. telde La (2), 2. telde Do (1) ve Re (3), 1. telde Fa (1) ve Sol (3) vardır. Mi–Fa ve Si–Do arasında yarım ses olduğu için bu notalar komşu perdelerdedir.', 'First position uses the open strings and the first three frets. String 6 has F (fret 1) and G (fret 3); string 5 has B (2) and C (3); string 4 has E (2) and F (3); string 3 has A (2); string 2 has C (1) and D (3); string 1 has F (1) and G (3). E–F and B–C are a semitone apart, so those notes sit on neighbouring frets.'],
    ['Bir teli boş sesinden başlayarak alfabetik sırayla yukarı doğru say.', 'Count up each string alphabetically from its open note.'],
    ['İlk üç perdedeki konumları adlandırma', 'Naming locations in the first three frets'],
    { filter: { module: 'guitar', task: 'name-note' }, predicate: row => placeOf(row.item)[1] <= 3, minAttempts: 12, minAccuracy: 0.85 }, [
      question('3. telde (Sol) 2. perde hangi notadır?', 'Which note is string 3 (G), fret 2?', ['La', 'Si', 'Sol♯'], ['A', 'B', 'G♯'], 0, 'Sol’den iki yarım ses yukarısı La’dır.', 'Two semitones above G is A.'),
      question('5. telde (La) 3. perde hangi notadır?', 'Which note is string 5 (A), fret 3?', ['Si', 'Do', 'Re'], ['B', 'C', 'D'], 1, 'La → Si (2. perde) → Do (3. perde).', 'A → B (fret 2) → C (fret 3).'),
      question('1. telde (Mi) 1. perde hangi notadır?', 'Which note is string 1 (E), fret 1?', ['Fa', 'Fa♯', 'Mi♭'], ['F', 'F♯', 'E♭'], 0, 'Mi ile Fa arasında yarım ses vardır; tek perde Fa’ya götürür.', 'E to F is a semitone, so one fret gives F.'),
      question('2. telde (Si) 1. perde hangi notadır?', 'Which note is string 2 (B), fret 1?', ['Do', 'Do♯', 'La'], ['C', 'C♯', 'A'], 0, 'Si ile Do arasında yarım ses vardır.', 'B to C is a semitone.'),
    ]),
  lesson('guitar-unisons', 'guitar', 5, 'guitar', ['guitar-first-position'],
    ['Aynı ses, farklı tel', 'Same pitch, different string'],
    ['Komşu tellerde aynı sesi veren konumları bul.', 'Find positions on neighbouring strings that give the same pitch.'],
    ['Standart akortta bir telin 5. perdesi, genellikle bir üstteki (daha ince) telin boş sesiyle aynıdır. Tek istisna 3. teldir: 3. telin 4. perdesi 2. telin boş Si sesini verir. Bu yüzden porteden okunan bir ses, seçilen perde aralığında birden fazla yerde bulunabilir.', 'In standard tuning, fret 5 of a string usually matches the open sound of the next higher string. The one exception is string 3: its fret 4 gives the open B of string 2. That is why a written pitch can appear in more than one place in the chosen fret range.'],
    ['Bir konum bulduğunda bir alt telde beş perde yukarıya da bak.', 'When you find a location, also check five frets higher on the next lower string.'],
    ['Porteden okunan sesin bütün konumlarını bulma', 'Finding every location of a written pitch'],
    { filter: { module: 'guitar', task: ['staff-to-fretboard', 'staff-to-location'] }, minAttempts: 8, minAccuracy: 0.8 }, [
      question('6. telin 5. perdesi hangi boş telle aynı sesi verir?', 'Fret 5 on string 6 sounds the same as which open string?', ['5. tel (La)', '4. tel (Re)', '1. tel (Mi)'], ['String 5 (A)', 'String 4 (D)', 'String 1 (E)'], 0, 'Mi’den beş yarım ses yukarısı La’dır.', 'Five semitones above E is A.'),
      question('3. telin hangi perdesi 2. telin boş sesini verir?', 'Which fret on string 3 matches open string 2?', ['3. perde', '4. perde', '5. perde'], ['Fret 3', 'Fret 4', 'Fret 5'], 1, 'Sol ile Si arası dört yarım sestir; bu yüzden istisna 4. perdedir.', 'G to B is four semitones, so the exception is fret 4.'),
      question('Porteden okunan bir ses gitarda kaç yerde olabilir?', 'In how many places can a written pitch appear on guitar?', ['Yalnız bir', 'Birden fazla', 'Hiç'], ['Only one', 'More than one', 'None'], 1, 'Aynı ses yüksekliği farklı tel–perde birleşimlerinde tekrar edebilir.', 'The same pitch can recur on different string–fret combinations.'),
      question('4. telin 5. perdesi hangi notadır?', 'Which note is string 4, fret 5?', ['Sol', 'La', 'Fa'], ['G', 'A', 'F'], 0, 'Re’den beş yarım ses yukarısı Sol’dür; 3. boş tel de Sol’dür.', 'Five semitones above D is G, the same as open string 3.'),
    ]),
  lesson('piano-bass-keys', 'piano', 4, 'piano', ['piano-map', 'bass-clef'],
    ['Fa anahtarından tuşlara', 'From bass clef to keys'],
    ['Fa anahtarındaki notaları klavyenin sol tarafında bul.', 'Find bass-clef notes on the left side of the keyboard.'],
    ['Piyanoda sol el çoğunlukla fa anahtarıyla yazılır. Fa anahtarında en alt çizgi Sol2, en üst çizgi La3’tür. Portenin üstündeki ilk ek çizgi orta Do (Do4) olur: sol anahtarının altındaki ilk ek çizgiyle aynı tuştur. Fa anahtarı çalışmasında Do2–Do4 aralığındaki tuşları kullan.', 'On piano the left hand is usually written in bass clef. Its bottom line is G2 and its top line A3. The first ledger line above it is middle C (C4): the same key as the first ledger line below the treble staff. Use keys from C2 to C4 in the bass-clef practice.'],
    ['Önce orta Do’yu bul; fa anahtarındaki notaları oradan sola doğru say.', 'Find middle C first, then count left from it for bass-clef notes.'],
    ['Fa anahtarındaki notayı doğru oktavdaki tuşta bulma', 'Finding a bass-clef note on the key in the right octave'],
    { filter: { module: 'piano', clef: 'bass', task: 'locate' }, minAttempts: 8, minAccuracy: 0.8 }, [
      question('Fa anahtarının üstündeki ilk ek çizgi hangi notadır?', 'What is the first ledger line above the bass staff?', ['Si3', 'Do4', 'Re4'], ['B3', 'C4', 'D4'], 1, 'Bu nota orta Do’dur ve sol anahtarındaki ilk alt ek çizgiyle aynı tuştur.', 'It is middle C, the same key as the first ledger line below the treble staff.'),
      question('Fa anahtarında en alt çizgi hangi tuştur?', 'Which key is the bottom line of the bass staff?', ['Sol2', 'Mi2', 'Sol3'], ['G2', 'E2', 'G3'], 0, 'Fa anahtarında en alt çizgi Sol2’dir.', 'The bottom line of the bass staff is G2.'),
      question('Do3, Do4’e göre klavyenin hangi tarafındadır?', 'Where is C3 compared with C4 on the keyboard?', ['Bir oktav solda', 'Bir oktav sağda', 'Aynı tuş'], ['One octave to the left', 'One octave to the right', 'The same key'], 0, 'Daha kalın sesler soldadır; bir oktav aşağısı yedi beyaz tuş soldadır.', 'Lower pitches are to the left; one octave down is seven white keys left.'),
      question('Piyanoda sol el genellikle hangi anahtarla yazılır?', 'Which clef usually shows the piano left hand?', ['Sol anahtarı', 'Fa anahtarı', 'Anahtarsız'], ['Treble clef', 'Bass clef', 'No clef'], 1, 'Sol el daha kalın sesleri çaldığı için genellikle fa anahtarıyla yazılır.', 'The left hand plays lower pitches, so it is usually written in bass clef.'),
    ]),
  lesson('piano-black-keys', 'piano', 4, 'piano', ['piano-map', 'accidentals'],
    ['Siyah tuşlar ve eşsesliler', 'Black keys and enharmonics'],
    ['Diyez ve bemolleri siyah tuşlarla eşleştir.', 'Match sharps and flats to the black keys.'],
    ['Her siyah tuş, iki yanındaki beyaz tuşlara göre adlandırılabilir: Do ile Re arasındaki tuş Do♯ veya Re♭’dir. Aynı tuşun iki farklı yazılışına eşseslilik denir. Mi–Fa ve Si–Do arasında siyah tuş yoktur; bu çiftler zaten yarım ses aralıklıdır. Piyano çalışmasında tuşu adlandırırken iki yazılış da kabul edilir; porte okumasında ise yazıldığı gibi cevap verilir.', 'Each black key can be named from the white keys beside it: the key between C and D is C♯ or D♭. Two spellings of the same key are called enharmonics. There is no black key between E–F or B–C; those pairs are already a semitone apart. When naming a piano key both spellings are accepted; when reading the staff, answer as written.'],
    ['Bir siyah tuşu önce solundaki beyaz tuşun diyezi, sonra sağındakinin bemolü olarak söyle.', 'Name a black key as the sharp of the white key on its left, then as the flat of the key on its right.'],
    ['Siyah tuşları diyez veya bemol olarak doğru adlandırma', 'Naming black keys correctly as sharps or flats'],
    { filter: { module: 'piano' }, predicate: row => row.midi !== undefined && BLACK_KEYS.has(row.midi % 12), minAttempts: 6, minAccuracy: 0.8 }, [
      question('Fa ile Sol arasındaki siyah tuşun adları nedir?', 'What are the names of the black key between F and G?', ['Fa♯ / Sol♭', 'Mi♯ / Fa♭', 'Sol♯ / La♭'], ['F♯ / G♭', 'E♯ / F♭', 'G♯ / A♭'], 0, 'Fa’dan yarım ses yukarı ya da Sol’den yarım ses aşağı.', 'A semitone above F or a semitone below G.'),
      question('Hangi beyaz tuş çiftinin arasında siyah tuş yoktur?', 'Which pair of white keys has no black key between them?', ['Mi–Fa', 'Do–Re', 'Sol–La'], ['E–F', 'C–D', 'G–A'], 0, 'Mi–Fa ve Si–Do zaten yarım ses aralıklıdır.', 'E–F and B–C are already a semitone apart.'),
      question('Re♯ ile Mi♭ piyanoda nasıl bir ilişkidedir?', 'How are D♯ and E♭ related on the piano?', ['Aynı tuş', 'Bir oktav farklı', 'İki ayrı siyah tuş'], ['The same key', 'An octave apart', 'Two different black keys'], 0, 'Bunlar aynı tuşun iki yazılışıdır; eşsesli denir.', 'They are two spellings of one key, called enharmonics.'),
      question('Si♭ hangi iki beyaz tuşun arasındadır?', 'Between which two white keys is B♭?', ['La ve Si', 'Si ve Do', 'Sol ve La'], ['A and B', 'B and C', 'G and A'], 0, 'Si’den yarım ses aşağı, La ile Si arasındaki siyah tuştur.', 'A semitone below B is the black key between A and B.'),
    ]),
  lesson('violin-strings', 'violin', 3, 'violin', ['staff-basics'],
    ['Kemanın boş telleri', 'The violin’s open strings'],
    ['Dört boş telin seslerini ve portedeki yerlerini öğren.', 'Learn the four open strings and where they sit on the staff.'],
    ['Keman beşli aralıklarla akort edilir: Sol3, Re4, La4 ve Mi5. Sol3 sol anahtarında portenin altında, ikinci ek çizginin altındaki aralıktadır; Re4 portenin hemen altındaki aralıkta, La4 ikinci aralıkta, Mi5 dördüncü aralıktadır. Boş tel, parmakla basılmadan çalınan teldir.', 'The violin is tuned in fifths: G3, D4, A4 and E5. In treble clef G3 sits below the second ledger line under the staff; D4 is in the space just below the staff, A4 in the second space and E5 in the fourth space. An open string is played without a finger down.'],
    ['Telleri kalından inceye Sol–Re–La–Mi diye sırayla söyle; her adım bir beşlidir.', 'Say the strings from low to high as G–D–A–E; each step is a fifth.'],
    ['Boş tel seslerini portede tanıyıp kemanda bulma', 'Recognising open-string pitches on the staff and finding them on the violin'],
    { filter: { module: 'violin' }, predicate: row => placeOf(row.item)[1] === 0, minAttempts: 4, minAccuracy: 0.8 }, [
      question('Kemanın en kalın boş teli hangisidir?', 'Which is the violin’s lowest open string?', ['Sol', 'Re', 'Mi'], ['G', 'D', 'E'], 0, 'Teller kalından inceye Sol–Re–La–Mi’dir.', 'From low to high the strings are G–D–A–E.'),
      question('Kemanın en ince boş teli hangi nota?', 'Which note is the violin’s highest open string?', ['La4', 'Mi5', 'Sol4'], ['A4', 'E5', 'G4'], 1, 'En ince tel Mi5’tir.', 'The highest string is E5.'),
      question('Keman telleri hangi aralıkla akort edilir?', 'What interval separates the violin strings?', ['Dörtlü', 'Beşli', 'Oktav'], ['A fourth', 'A fifth', 'An octave'], 1, 'Sol–Re–La–Mi, art arda tam beşlilerdir.', 'G–D–A–E are consecutive perfect fifths.'),
      question('Sol anahtarında ikinci aralıktaki nota hangi boş teldir?', 'Which open string is the note in the second space of the treble staff?', ['La', 'Re', 'Mi'], ['A', 'D', 'E'], 0, 'İkinci aralık La4’tür; kemanın La teli.', 'The second space is A4, the violin’s A string.'),
    ]),
  lesson('violin-first-position', 'violin', 5, 'violin', ['violin-strings'],
    ['Kemanda birinci pozisyon', 'First position on violin'],
    ['Her telde 1–4. parmakların verdiği notaları öğren.', 'Learn the notes that fingers 1–4 give on each string.'],
    ['Birinci pozisyonda 1. parmak boş telden bir tam ses yukarıdadır; 3. parmak boş telden dörtlü yukarıdadır; 4. parmak bir sonraki boş telin sesini verir. Örneğin La telinde 1. parmak Si, 3. parmak Re, 4. parmak Mi’dir. Bu çalışma parmak ve konum bilgisini sınar; entonasyonu veya yay tekniğini ölçmez.', 'In first position, finger 1 is a whole tone above the open string; finger 3 is a fourth above it; finger 4 gives the next open string’s pitch. On the A string, finger 1 is B, finger 3 D and finger 4 E. This exercise checks finger and position knowledge, not intonation or bowing.'],
    ['Her telde boş–1–2–3–4 dizisini söyleyerek beş notalık bir basamak oluştur.', 'Say open–1–2–3–4 on each string to build a five-note step.'],
    ['Birinci pozisyondaki notaları tel ve parmakla eşleştirme', 'Matching first-position notes to strings and fingers'],
    { filter: { module: 'violin' }, minAttempts: 12, minAccuracy: 0.8 }, [
      question('La telinde 1. parmak hangi nota?', 'Which note is finger 1 on the A string?', ['Si', 'Do', 'Sol'], ['B', 'C', 'G'], 0, 'La’dan bir tam ses yukarısı Si’dir.', 'A whole tone above A is B.'),
      question('La telinde 4. parmak hangi boş telin sesini verir?', 'Finger 4 on the A string matches which open string?', ['Mi', 'Re', 'Sol'], ['E', 'D', 'G'], 0, '4. parmak bir sonraki telin boş sesidir: Mi.', 'Finger 4 gives the next string’s open note: E.'),
      question('Re telinde 3. parmak hangi nota?', 'Which note is finger 3 on the D string?', ['Sol', 'Fa', 'La'], ['G', 'F', 'A'], 0, 'Re’den dörtlü yukarısı Sol’dür.', 'A fourth above D is G.'),
      question('Birinci pozisyonda Mi telinde tam ses aralıklı 1. parmak hangi notayı verir?', 'In first position, which note does a whole-step finger 1 give on the E string?', ['Fa', 'Fa♯', 'Sol'], ['F', 'F♯', 'G'], 1, 'Birinci pozisyonda 1. parmak bir tam ses yukarıda Fa♯’dir; doğal Fa için parmak geri (düşük) konur.', 'In first position finger 1 is a whole tone up, F♯; natural F needs a low first finger.'),
    ]),
  lesson('violin-low-high', 'violin', 4, 'violin', ['violin-first-position'],
    ['Düşük ve yüksek parmaklar', 'Low and high fingers'],
    ['Aynı parmağın yarım ses farkla iki yeri olduğunu öğren.', 'Learn that one finger can sit in two places a semitone apart.'],
    ['Kemanda perde yoktur; parmak yarım ses geri konursa “düşük”, ileri konursa “yüksek” olur. La telinde düşük 2. parmak Do, yüksek 2. parmak Do♯’dir. Mi telinde doğal Fa için düşük 1. parmak kullanılır. Uygulamadaki ↓ işareti düşük parmağı gösterir.', 'The violin has no frets; a finger placed a semitone back is “low”, a semitone forward is “high”. On the A string, low 2 is C and high 2 is C♯. On the E string, natural F uses a low first finger. The ↓ mark in the practice shows a low finger.'],
    ['Düşük 2. parmakta 1 ile 2 birbirine değer; yüksek 2’de 2 ile 3 değer.', 'With low 2, fingers 1 and 2 touch; with high 2, fingers 2 and 3 touch.'],
    ['Düşük parmakla çalınan doğal notaları bulma', 'Finding natural notes played with a low finger'],
    { filter: { module: 'violin' }, predicate: row => [1, 3].includes(placeOf(row.item)[1]), minAttempts: 4, minAccuracy: 0.75 }, [
      question('La telinde düşük 2. parmak hangi nota?', 'Which note is low 2 on the A string?', ['Do', 'Do♯', 'Si'], ['C', 'C♯', 'B'], 0, 'La’dan küçük üçlü yukarısı Do’dur.', 'A minor third above A is C.'),
      question('Düşük ve yüksek 2. parmak arasındaki fark nedir?', 'What separates low 2 from high 2?', ['Yarım ses', 'Tam ses', 'Oktav'], ['A semitone', 'A whole tone', 'An octave'], 0, 'Aynı parmak yarım ses geri veya ileri konur.', 'The same finger moves back or forward by a semitone.'),
      question('Mi telinde doğal Fa hangi parmakla çalınır?', 'Which finger plays natural F on the E string?', ['Düşük 1. parmak', 'Yüksek 1. parmak', '2. parmak'], ['Low first finger', 'High first finger', 'Second finger'], 0, 'Mi–Fa yarım ses olduğundan 1. parmak geri (düşük) konur.', 'E–F is a semitone, so the first finger sits back (low).'),
      question('Re telinde yüksek 2. parmak hangi nota?', 'Which note is high 2 on the D string?', ['Fa♯', 'Fa', 'Sol'], ['F♯', 'F', 'G'], 0, 'Re’den büyük üçlü yukarısı Fa♯’dir.', 'A major third above D is F♯.'),
    ]),
  lesson('intervals-intro', 'ear', 4, 'ear', ['octaves'],
    ['Aralıkları duy', 'Hear intervals'],
    ['İki ses arasındaki mesafeyi adlandırmaya başla.', 'Begin naming the distance between two pitches.'],
    ['Aralık, iki ses arasındaki mesafedir ve yarım ses sayısıyla ölçülür: küçük ikili 1, büyük ikili 2, küçük üçlü 3, büyük üçlü 4, tam dörtlü 5, tam beşli 7, oktav 12 yarım sestir. Do–Mi büyük üçlü, Do–Sol tam beşlidir. İşitme atölyesinde önce yalnız birkaç aralığı karşılaştırarak başla.', 'An interval is the distance between two pitches, measured in semitones: minor second 1, major second 2, minor third 3, major third 4, perfect fourth 5, perfect fifth 7, octave 12. C–E is a major third and C–G a perfect fifth. In the listening workshop, start by comparing only a few intervals.'],
    ['Her aralık için bildiğin bir ezginin ilk iki sesini referans olarak kullan.', 'Use the first two notes of a melody you know as a reference for each interval.'],
    ['Duyulan aralığı adlandırma', 'Naming heard intervals'],
    { filter: { module: 'ear', task: 'interval' }, minAttempts: 8, minAccuracy: 0.7 }, [
      question('Do–Mi aralığı kaç yarım sestir?', 'How many semitones is C–E?', ['3', '4', '5'], ['3', '4', '5'], 1, 'Do–Do♯–Re–Re♯–Mi: dört yarım ses, büyük üçlü.', 'C–C♯–D–D♯–E: four semitones, a major third.'),
      question('Tam beşli kaç yarım sestir?', 'How many semitones is a perfect fifth?', ['5', '7', '12'], ['5', '7', '12'], 1, 'Do–Sol yedi yarım sestir.', 'C–G is seven semitones.'),
      question('Oktav kaç yarım sestir?', 'How many semitones is an octave?', ['8', '10', '12'], ['8', '10', '12'], 2, 'Oktav on iki yarım sestir.', 'An octave is twelve semitones.'),
      question('La–Do aralığı hangisidir?', 'Which interval is A–C?', ['Küçük üçlü', 'Büyük üçlü', 'Tam dörtlü'], ['Minor third', 'Major third', 'Perfect fourth'], 0, 'La–La♯–Si–Do: üç yarım ses, küçük üçlü.', 'A–A♯–B–C: three semitones, a minor third.'),
    ]),
  lesson('triads-intro', 'ear', 4, 'ear', ['intervals-intro'],
    ['Majör ve minör akorlar', 'Major and minor chords'],
    ['Üç sesli akorların yapısını ve rengini ayırt et.', 'Distinguish the structure and colour of three-note chords.'],
    ['Üçlü akor, üst üste iki üçlüden oluşur. Majör akor: kök + büyük üçlü + küçük üçlü (Do–Mi–Sol). Minör akor: kök + küçük üçlü + büyük üçlü (La–Do–Mi). Eksik akor iki küçük üçlüden (Si–Re–Fa), artık akor iki büyük üçlüden (Do–Mi–Sol♯) oluşur. İşitme atölyesinde akoru önce birlikte, sonra sesleri sırayla dinleyebilirsin.', 'A triad stacks two thirds. Major: root + major third + minor third (C–E–G). Minor: root + minor third + major third (A–C–E). Diminished stacks two minor thirds (B–D–F); augmented two major thirds (C–E–G♯). In the listening workshop you can hear a chord together, then note by note.'],
    ['Önce yalnız majör ve minörü karşılaştır; diğer türleri sonra ekle.', 'Compare only major and minor first; add the other types later.'],
    ['Duyulan akorun türünü ayırt etme', 'Identifying the quality of a heard chord'],
    { filter: { module: 'ear', task: 'chord' }, minAttempts: 8, minAccuracy: 0.7 }, [
      question('Do–Mi–Sol hangi akordur?', 'Which chord is C–E–G?', ['Do majör', 'Do minör', 'Do eksik'], ['C major', 'C minor', 'C diminished'], 0, 'Büyük üçlü (Do–Mi) üzerine küçük üçlü (Mi–Sol): majör.', 'A major third (C–E) plus a minor third (E–G): major.'),
      question('Minör akorun alt üçlüsü nasıldır?', 'What is the lower third of a minor chord?', ['Küçük üçlü', 'Büyük üçlü', 'Tam beşli'], ['Minor third', 'Major third', 'Perfect fifth'], 0, 'Minör akor kökten küçük üçlüyle başlar: La–Do.', 'A minor chord starts with a minor third from the root: A–C.'),
      question('Si–Re–Fa hangi akor türüdür?', 'What type of chord is B–D–F?', ['Majör', 'Minör', 'Eksik'], ['Major', 'Minor', 'Diminished'], 2, 'İki küçük üçlü üst üste: eksik akor.', 'Two stacked minor thirds: diminished.'),
      question('La minör akorunun sesleri hangileridir?', 'Which notes form an A minor chord?', ['La–Do–Mi', 'La–Do♯–Mi', 'La–Re–Fa'], ['A–C–E', 'A–C♯–E', 'A–D–F'], 0, 'La–Do küçük üçlü, Do–Mi büyük üçlü.', 'A–C is a minor third, C–E a major third.'),
    ]),
];

/** Accept only known completed checks. Never treat arbitrary local data as content. */
export function validCompletedLessons(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === 'string' && LEARNING_LESSONS.some(l => l.id === id)))];
}

/**
 * Per-lesson learning states. "Read", "checked" and "applied" are separate facts:
 * reading an explanation is not passing a check, and passing a check is not
 * showing the skill in practice.
 * @typedef {{lessonId:string, readAt?:string, checkedAt?:string}} LessonState
 * @param {unknown} value
 * @param {number} [now]
 * @returns {LessonState[]}
 */
export function validLessonStates(value, now = Date.now()) {
  if (!Array.isArray(value)) return [];
  /** @type {Map<string, LessonState>} */
  const states = new Map();
  for (const row of value) {
    if (!row || !LEARNING_LESSONS.some(l => l.id === row.lessonId)) continue;
    /** @type {LessonState} */
    const clean = { lessonId: row.lessonId };
    for (const key of /** @type {const} */ (['readAt', 'checkedAt'])) {
      const at = Date.parse(row[key]);
      if (Number.isFinite(at) && at <= now + 60000) clean[key] = new Date(at).toISOString();
    }
    if (!clean.readAt && !clean.checkedAt) continue;
    const previous = states.get(row.lessonId) ?? { lessonId: row.lessonId };
    // Keep the first time each state was reached.
    states.set(row.lessonId, {
      lessonId: row.lessonId,
      readAt: [previous.readAt, clean.readAt].filter(Boolean).sort()[0],
      checkedAt: [previous.checkedAt, clean.checkedAt].filter(Boolean).sort()[0],
    });
  }
  return [...states.values()];
}

/**
 * @param {unknown} states
 * @param {string} lessonId
 * @param {'readAt'|'checkedAt'} key
 * @param {number} [now]
 */
export function markLessonState(states, lessonId, key, now = Date.now()) {
  if (!LEARNING_LESSONS.some(l => l.id === lessonId)) throw new RangeError('Unknown lesson');
  return validLessonStates([...validLessonStates(states, now), { lessonId, [key]: new Date(now).toISOString() }], now);
}

/**
 * The learner-facing status of a lesson.
 * @param {Lesson} item
 * @param {LessonState[]} states
 * @param {string[]} completedIds
 * @param {unknown} evidence
 * @param {number} [now]
 */
export function lessonStatus(item, states, completedIds, evidence, now = Date.now()) {
  const state = states.find(row => row.lessonId === item.id);
  const checked = completedIds.includes(item.id);
  const application = checked && state?.checkedAt ? practiceApplication(evidence, item.application, state.checkedAt, now)
    : { applied: false, attempts: 0, correct: 0, required: item.application.minAttempts };
  const stage = application.applied ? 'applied' : checked ? 'checked' : state?.readAt ? 'read' : 'new';
  const missing = item.requires.filter(id => !completedIds.includes(id));
  return { stage, application, missing, legacyCheck: checked && !state?.checkedAt };
}

/**
 * Chooses the questions for one knowledge check. Consecutive checks avoid
 * repeating the previous pair when the pool allows it, and options are shuffled.
 * @param {Lesson} item
 * @param {number[]} [previous]
 * @param {() => number} [rng]
 */
export function drawCheck(item, previous = [], rng = Math.random) {
  const pick = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random value');
    return value;
  };
  const indexes = item.questions.map((_, index) => index);
  const fresh = indexes.filter(index => !previous.includes(index));
  const pool = fresh.length >= QUESTIONS_PER_CHECK ? fresh : indexes;
  const chosen = [];
  const remaining = [...pool];
  while (chosen.length < Math.min(QUESTIONS_PER_CHECK, pool.length)) chosen.push(remaining.splice(Math.floor(pick() * remaining.length), 1)[0]);
  return chosen.map(index => {
    const source = item.questions[index];
    const order = source.options.tr.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(pick() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      index, prompt: source.prompt, explanation: source.explanation, answerIndex: order.indexOf(source.answerIndex),
      options: { tr: order.map(i => source.options.tr[i]), en: order.map(i => source.options.en[i]) },
    };
  });
}

const moduleSkill = value => {
  const name = String(value).toLocaleLowerCase('tr-TR');
  if (/gitar|guitar/.test(name)) return 'guitar';
  if (/piyano|piano/.test(name)) return 'piano';
  if (/keman|violin/.test(name)) return 'violin';
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

/** The first unfinished lesson whose prerequisites are all complete. */
function nextLesson(completed) {
  return LEARNING_LESSONS.find(item => !completed.includes(item.id) && item.requires.every(id => completed.includes(id)))
    ?? LEARNING_LESSONS.find(item => !completed.includes(item.id));
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
  const next = nextLesson(completed);
  return { lessonId:next?.id ?? 'subdivisions', reason:completed.length ? (next?'continue':'revisit') : 'start', evidenceSessions:0 };
}

/**
 * Maps a repeated, question-level weakness to the lesson that explains it.
 * Returns null when there is not enough comparable evidence.
 * @param {unknown} evidence
 * @param {number} [now]
 */
export function recommendFromEvidence(evidence, now = Date.now()) {
  const [weak] = findWeakItems(evidence, {}, now);
  if (!weak) return null;
  /** @type {string} */
  let lessonId = 'treble-anchors';
  if (weak.module === 'reading') {
    lessonId = weak.clef === 'bass' ? 'bass-clef'
      : weak.accidental ? 'accidentals'
        : weak.position !== undefined && (weak.position <= -1 || weak.position >= 9) ? 'ledger-lines' : 'treble-anchors';
  } else if (weak.module === 'score') {
    lessonId = weak.task === 'entry-after-rest' ? 'rest-entries'
      : weak.task.startsWith('rest') ? 'rests-measures'
        : weak.task.startsWith('study:key') ? 'key-signatures'
          : weak.clef === 'bass' ? 'bass-clef' : weak.timeouts >= weak.recentErrors / 2 ? 'pulse-tempo' : 'treble-anchors';
  } else if (weak.module === 'guitar') {
    lessonId = weak.task === 'name-note' ? 'guitar-first-position' : 'guitar-unisons';
  } else if (weak.module === 'piano') {
    lessonId = weak.clef === 'bass' ? 'piano-bass-keys' : weak.midi !== undefined && BLACK_KEYS.has(weak.midi % 12) ? 'piano-black-keys' : 'piano-map';
  } else if (weak.module === 'violin') {
    lessonId = [1, 3].includes(placeOf(weak.item)[1]) ? 'violin-low-high' : 'violin-first-position';
  } else if (weak.module === 'ear') {
    lessonId = weak.task === 'chord' ? 'triads-intro' : 'intervals-intro';
  }
  return { lessonId, reason: 'evidence', item: weak };
}
