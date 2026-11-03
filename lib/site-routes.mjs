export const SITE_PAGES = {
  landing: { path: '', tr: ['Stüdyo', 'Sol ve fa anahtarında nota okuma, ritim, işitme ve enstrüman çalışmaları.'], en: ['Studio', 'Practise note reading, rhythm, listening and instruments in treble and bass clefs.'] },
  setup: { path: 'nota-oku', tr: ['Nota oku', 'Doğal, diyez ve bemol notaları dört seviyede tanı.'], en: ['Read notes', 'Recognise natural, sharp and flat notes across four ranges.'] },
  pieces: { path: 'eser-okuma', tr: ['Eser okuma', 'Rastgele porte satırlarını 15–112 BPM aralığında ritimle veya kendi hızında oku.'], en: ['Score reading', 'Read random staff lines at your own pace or with a pulse from 15–112 BPM.'] },
  instruments: { path: 'muzik-aletleri', tr: ['Müzik aletleri', 'Gitar, piyano ve keman üzerinde nota yerlerini öğren.'], en: ['Instruments', 'Learn note locations on guitar, piano and violin.'] },
  guitar: { path: 'muzik-aletleri/gitar', tr: ['Gitar çalışması', 'Portedeki notayı gitarın tel ve perdelerine eşleştir.'], en: ['Guitar practice', 'Match the written pitch to strings and frets.'] },
  piano: { path: 'muzik-aletleri/piyano', tr: ['Piyano çalışması', 'Sol ve fa anahtarındaki notaları piyano tuşlarıyla eşleştir.'], en: ['Piano practice', 'Match treble and bass staff notes to piano keys.'] },
  violin: { path: 'muzik-aletleri/keman', tr: ['Keman çalışması', 'Standart akortta birinci ve üçüncü pozisyondaki doğal notaları tel ve parmaklarla öğren.'], en: ['Violin practice', 'Learn natural notes, strings and fingers in first and third position with standard tuning.'] },
  practice: { path: 'calis', tr: ['Çalış', 'Nota okuma, eser okuma, enstrümanlar, ritim ve işitme çalışmaları tek yerde.'], en: ['Practice', 'Note reading, score reading, instruments, rhythm and listening practice in one place.'] },
  'score-import': { path: 'eser-okuma/musicxml', tr: ['MusicXML ile eser çalış', 'Kendi MusicXML dosyanı aç, partisyonu gör ve tek sesli bölümleri ölçü ölçü çalış.'], en: ['Practise a MusicXML piece', 'Open your own MusicXML file, see the score and practise single-line passages bar by bar.'] },
  'listen-play': { path: 'muzik-aletleri/mikrofon', tr: ['Mikrofonla çal', 'Enstrümanınla tek ses çal; NotaNota tarayıcıda duyduğu perdeyi beklenen notayla karşılaştırır.'], en: ['Play to the microphone', 'Play single notes on your instrument; NotaNota compares the pitch it hears in the browser with the note expected.'] },
  teacher: { path: 'notanota-ai', tr: ['NotaNota AI', 'Bir partisyon ekle, son çalışmanı incele veya takıldığın notayı sor.'], en: ['NotaNota AI', 'Add a score, look at your last practice, or ask about the note you are stuck on.'] },
  pricing: { path: 'fiyatlar', tr: ['NotaNota AI ve fiyatlar', 'Ücretsiz temel çalışma ve NotaNota AI öğretmen; fiyat açıklandığında burada yer alacak.'], en: ['NotaNota AI and pricing', 'Free core practice and the NotaNota AI teacher; the price will appear here once announced.'] },
  palettes: { path: 'tasarim/paletler', tr: ['Renk temaları', 'Aynı başlık, porte ve düğmelerin beş renk temasında, açık ve koyu modda karşılaştırması.'], en: ['Colour themes', 'The same heading, staff and buttons in five colour themes, light and dark.'] },
  rhythm: { path: 'ritim', tr: ['Ritim atölyesi', 'Eşit vuruşu ve suslu, bölünmüş ritim örüntülerini dokunarak çalış.'], en: ['Rhythm workshop', 'Tap a steady pulse and rhythm patterns with rests and subdivisions.'] },
  listening: { path: 'isitme', tr: ['İşitme atölyesi', 'Perde yönü, aralık, akor türü ve kısa melodik dikte çalış.'], en: ['Listening workshop', 'Practise pitch direction, intervals, chord quality and short melodic dictation.'] },
  lessons: { path: 'dersler', tr: ['Dersler', 'Önkoşullu kısa dersler, bilgi kontrolleri ve aralıklı tekrar.'], en: ['Lessons', 'Short lessons with prerequisites, knowledge checks and spaced review.'] },
  progress: { path: 'ilerleme', tr: ['İlerleme', 'Beceri haritası, ders durumu ve bu cihazdaki çalışma geçmişi.'], en: ['Progress', 'Skill map, lesson status and practice history on this device.'] },
  about: { path: 'hakkinda', tr: ['Hakkında', 'NotaNota, günlük kısa çalışmalarla nota okuma akıcılığını geliştiren ücretsiz bir uygulamadır.'], en: ['About', 'NotaNota is a free application for building music-reading fluency with short daily practice.'] },
  how: { path: 'nasil-calisir', tr: ['Nasıl çalışır?', 'Seviyeni seç, notaları tanı ve sonuçlarına göre tekrar et.'], en: ['How it works', 'Choose a range, identify notes and review your results.'] },
  faq: { path: 'sss', tr: ['Sık sorulan sorular', 'Nota değerleri, anahtarlar, hesap ve çalışma modları hakkında yanıtlar.'], en: ['Frequently asked questions', 'Answers about rhythms, clefs, accounts and practice modes.'] },
  contact: { path: 'iletisim', tr: ['İletişim', 'Hata bildirimi, öneri ve veri taleplerini bize ilet.'], en: ['Contact', 'Send bug reports, suggestions and data requests.'] },
  roadmap: { path: 'yol-haritasi', tr: ['Yol haritası', 'Kullanılabilen çalışmalar ve planlanan geliştirmeler.'], en: ['Roadmap', 'Available practice tools and planned improvements.'] },
  privacy: { path: 'gizlilik', tr: ['Gizlilik', 'Hangi verileri işlediğimiz, nerede tuttuğumuz ve nasıl silebileceğin.'], en: ['Privacy', 'What data we process, where it is kept and how you can delete it.'] },
  kvkk: { path: 'kvkk-aydinlatma', tr: ['KVKK aydınlatma metni', '6698 sayılı Kanun kapsamında veri sorumlusu, amaçlar, aktarımlar ve başvuru yolu.'], en: ['KVKK notice', 'Data controller, purposes, transfers and how to make a request under Turkish law 6698.'] },
  terms: { path: 'kullanim-kosullari', tr: ['Kullanım koşulları', 'NotaNota’yı kullanırken geçerli kurallar.'], en: ['Terms of use', 'The rules that apply when you use NotaNota.'] },
  cookies: { path: 'cerezler', tr: ['Çerezler ve yerel depolama', 'Tarayıcında hangi bilgilerin neden saklandığı ve nasıl silineceği.'], en: ['Cookies and local storage', 'What your browser keeps for NotaNota, why, and how to clear it.'] },
  copyright: { path: 'telif-bildirimi', tr: ['Telif ve içerik bildirimi', 'Örnek eserlerin kaynakları ve bir içerik için nasıl bildirim yapılır.'], en: ['Copyright and content notice', 'Where the sample pieces come from and how to report content.'] },
};
export function pageRoute(stage, locale='tr') {
  const key=stage==='quiz'||stage==='done'?'setup':stage;
  return `./${locale==='en'?'en/':''}${SITE_PAGES[key]?.path ? SITE_PAGES[key].path+'/' : ''}`;
}
export function pageFromPath(path) {
  let clean;
  try { clean=decodeURIComponent(path).replace(/\/+$/, ''); } catch { return 'landing'; }
  return Object.entries(SITE_PAGES).sort((a,b)=>b[1].path.length-a[1].path.length).find(([,p])=>p.path && clean.endsWith('/'+p.path))?.[0] || 'landing';
}

/** True when a path relative to the site root (with or without the en/ prefix) is a page of the site. */
export function isKnownRoute(relative) {
  let clean;
  try { clean = decodeURIComponent(relative); } catch { return false; }
  clean = clean.replace(/^\/+|\/+$/g, '').replace(/index\.html$/, '').replace(/\/+$/, '');
  if (clean === 'en') clean = '';
  else if (clean.startsWith('en/')) clean = clean.slice(3);
  return clean === '' || Object.values(SITE_PAGES).some((page) => page.path === clean);
}
