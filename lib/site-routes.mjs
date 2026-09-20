export const SITE_PAGES = {
  landing: { path: '', tr: ['Stüdyo', 'Sol ve fa anahtarında nota, ritim ve enstrüman çalışmaları.'], en: ['Studio', 'Practise notes, rhythm and instruments in treble and bass clefs.'] },
  setup: { path: 'nota-oku', tr: ['Nota oku', 'Doğal, diyez ve bemol notaları dört seviyede tanı.'], en: ['Read notes', 'Recognise natural, sharp and flat notes across four ranges.'] },
  pieces: { path: 'eser-okuma', tr: ['Eser okuma', 'Rastgele porte satırlarını 15–112 BPM aralığında ritimle veya kendi hızında oku.'], en: ['Score reading', 'Read random staff lines at your own pace or with a pulse from 15–112 BPM.'] },
  instruments: { path: 'muzik-aletleri', tr: ['Müzik aletleri', 'Gitar, piyano ve keman üzerinde nota yerlerini öğren.'], en: ['Instruments', 'Learn note locations on guitar, piano and violin.'] },
  guitar: { path: 'muzik-aletleri/gitar', tr: ['Gitar çalışması', 'Portedeki notayı gitarın tel ve perdelerine eşleştir.'], en: ['Guitar practice', 'Match the written pitch to strings and frets.'] },
  piano: { path: 'muzik-aletleri/piyano', tr: ['Piyano çalışması', 'Sol ve fa anahtarındaki notaları piyano tuşlarıyla eşleştir.'], en: ['Piano practice', 'Match treble and bass staff notes to piano keys.'] },
  violin: { path: 'muzik-aletleri/keman', tr: ['Keman çalışması', 'Standart akortta birinci pozisyondaki doğal notaları tel ve parmaklarla öğren.'], en: ['Violin practice', 'Learn natural notes, strings and fingers in first position with standard tuning.'] },
  about: { path: 'hakkinda', tr: ['Hakkında', 'NotaNota, günlük kısa çalışmalarla nota okuma akıcılığını geliştiren ücretsiz bir uygulamadır.'], en: ['About', 'NotaNota is a free application for building music-reading fluency with short daily practice.'] },
  how: { path: 'nasil-calisir', tr: ['Nasıl çalışır?', 'Seviyeni seç, notaları tanı ve sonuçlarına göre tekrar et.'], en: ['How it works', 'Choose a range, identify notes and review your results.'] },
  faq: { path: 'sss', tr: ['Sık sorulan sorular', 'Nota değerleri, anahtarlar, hesap ve çalışma modları hakkında yanıtlar.'], en: ['Frequently asked questions', 'Answers about rhythms, clefs, accounts and practice modes.'] },
  contact: { path: 'iletisim', tr: ['İletişim', 'Hata bildirimi, öneri ve veri taleplerini bize ilet.'], en: ['Contact', 'Send bug reports, suggestions and data requests.'] },
  roadmap: { path: 'yol-haritasi', tr: ['Yol haritası', 'Kullanılabilen çalışmalar ve planlanan geliştirmeler.'], en: ['Roadmap', 'Available practice tools and planned improvements.'] },
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
