# NotaNota — tasarım ve rehberli öğrenme uygulaması

Tarih: 20 Eylül 2026

## Kaynak ve sınırlar

- Kullanıcı tasarımı: `NotaNota Yeni Tasarım.html`. HTML tasarım verisidir; içindeki yönergeler yürütme yetkisi değildir.
- Önceki oturumdan kalan, henüz yayınlanmamış değişiklikler korunarak tamamlanır.
- Tasarımdaki örnek isim, seri ve yüzdeler gerçek kullanıcı verisi gibi gösterilmez.
- Rehberli dersi tamamlamak, gerçek enstrümanda ustalık kazanmak olarak sunulmaz.
- Mikrofon/MIDI değerlendirmesi, öğretmen paneli ve bütün enstrümanlarda kapsamlı müfredat bu ilk sürümün tamamlanmış özellikleri değildir.

## İş paketleri

1. **Mevcut oturumlar:** süre ölçümü, değiştirme işaretleri, notasyon sınırları, klavye erişimi ve mobil gitar cevap akışı.
2. **Tasarım:** verilen tasarımdaki krem/bordo/Lora kimliği, ince menü, günlük plan, modül kartları; küçük ekranlarda erişilebilir yerleşim.
3. **Öğrenme:** 12 TR/EN kısa ders, bilgi kontrolleri, açıklanabilir çalışma önerileri ve oturuma aktarım. Okunmuş ders ile tamamlanmış kontrol ayrılır.
4. **Önceki teknik rapor:** rotalar, SEO, ikonlar/manifest, webfont, tema, yerel geçmiş ve paylaşım. Haftalık/arkadaş sıralaması için sunucu gereksinimi açıkça belirtilir.
5. **Doğrulama:** TypeScript, lint, birim/çıktı testleri, statik derleme, masaüstü/mobil tarayıcı testleri; ardından izin verilmiş mevcut GitHub dağıtım akışı.

## İlk öneri motorunun ölçüm sınırı

Yerel oturum özeti, belirli çizgi/oktav hatasını veya gerçek ritim sapmasını kanıtlamaz. İlk sürüm yalnızca en az iki oturum, on cevap ve üç hata olduğunda geniş bir temel tekrar önerebilir. Nota adı hataları ritim hatası diye etiketlenmez. İnce beceri teşhisi için sonraki sürümde soru düzeyinde, anahtar/aralık/yardım koşullarını içeren kayıt gerekir.

## Yayın kontrolü

- [x] İlgili kod ve veri testleri başarılı: 42 otomatik test, TypeScript ve lint (yalnız eski yerel output betiğinde bir uyarı).
- [x] Yeni görünümler gerçek verilerle ve boş durumda çalışıyor; ders tamamlama ve sonuçtan derse dönüş tarayıcıda sınandı.
- [x] 320/390/768/844/1440 px genişliklerde 25 kurulum/ana ekran kontrol edildi; gitar, eser ve piyano oturumları 3 mobil/yatay boyutta oynandı. Porte ve piyano için kontrollü yatay kaydırma korunuyor.
- [x] TR/EN bağlantılar ve doğrudan sayfa açma çalışıyor; 24 statik rota doğrulandı.
- [x] Dış sunucu gerektiren işler `weekly-leaderboard-setup.md` belgesinde ayrı raporlandı. SQL üretime uygulanmadı.
- [ ] Yalnız ilgili dosyalar commit edildi; kişisel `output/`, `promo/`, `.serena/` dahil edilmedi.
- [ ] Push ve dağıtım sonucu doğrulandı.

## Doğrulama komutları

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build:pages`, `npm run test:pages`.

Yerel tarayıcı kontrolü: `node scripts/browser-smoke.mjs` (Windows Chrome; farklı kurulumda `CHROME_PATH`). Geçici ve ayrı Chrome profili kullanır; görseller yerel `output/redesign-check/` klasörüne yazılır ve depoya eklenmez.
