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
- [x] İlk sürüm `a4aaf64` ile commit edildi; kişisel `output/`, `promo/`, `.serena/` dahil edilmedi.
- [x] İlk sürümün push ve GitHub Pages dağıtımı (35539396505) doğrulandı.

## İkinci paket — 21 Eylül 2026

- Küçük etiketler ve mobil dokunma hedefleri büyütüldü; 320 px başlık alanında logo, giriş, ses ve dil kontrolleri birbirinden ayrıldı.
- Stüdyoya bağımsız ritim atölyesi eklendi: 15–120 BPM, dört hazırlık vuruşu, sekiz dokunuş, açılıp kapanabilen metronom ve yaklaşık zamanlama geri bildirimi.
- Ses, Web Audio saatine göre planlanır. Durdurma, sekmeyi gizleme ve bileşenden ayrılma ses kaynaklarını temizler. Dokunuşlar sunucuya gönderilmez; cihaz gecikmesinin ölçümü etkileyebileceği açıkça belirtilir.
- Doğrulama: 47 otomatik test, 4 statik sayfa testi, TypeScript ve lint başarılı (kişisel output betiğinde önceden bulunan tek uyarı). Beş ekran genişliğinde 25 görünüm; üç mobil/yatay boyutta gitar/eser/piyano akışları ve ritim atölyesinin gerçek tarayıcı ses zamanlaması sınandı. Tarayıcıda JavaScript hatası yok.
- Haftalık/arkadaş sıralamasının SQL kurulumu hâlâ dış bağımlılık: yönetim bağlantısı yok ve yerel Docker servisi çalışmıyor. Üretim veritabanına değişiklik yapılmadı; ayrıntılar `weekly-leaderboard-setup.md` içinde.

## Üçüncü paket — dersler için aralıklı tekrar

- Bilgi kontrollerine tarayıcıda saklanan tekrar takvimi eklendi. Zamanı gelen ders, günlük öneride öncelik alır; yaklaşan dersler ve tarihi bilinmeyen eski tamamlamalar ayrı gösterilir.
- Tekrar modunda ders açıklaması başlangıçta kapalıdır. Açıklamayı açmak veya yanlış cevap vermek yardımlı tekrar olarak kaydedilir; ertesi güne planlanır. Yardımsız, zamanı gelmiş kontroller 1/3/7/14 günlük basit aralıklarla ilerler. Erken tekrar takvimi ileri taşımaz.
- Bu plan, iki soruluk bilgi kontrolüne dayalı bir hatırlatıcıdır; ustalık/unutma olasılığı tahmini veya gerçek enstrüman performansı ölçümü değildir. Eski tamamlamalara tarih uydurulmaz. Gecikmiş tekrar bir ceza veya başarısızlık sayılmaz.
- Bilgiler yalnız bu tarayıcıdadır; farklı cihazlar arasında hesap eşitlemesi yapılmaz. Tarihler cihaz saatine göre gösterilir.
- Doğrulama: 55 otomatik test ve 4 statik sayfa testi, TypeScript, lint; tarayıcıda zamanı gelen dersin önerilmesi, açıklamasız kontrol, aralığın uzaması ve yardım sonrası sıfırlanması. Mevcut 25 görünüm ve mobil oturum kontrolleri de korundu.

## Sonraki ürün geliştirmeleri (henüz tamamlanmadı)

Gerçek nota/enstrüman oturumlarında soru düzeyinde kanıta dayalı uyarlanabilir tekrar, işitme eğitimi, kontrollü müzikal etütler, MIDI/mikrofon değerlendirmesi ve öğretmen araçları ayrı geliştirmeler olarak kalır. Kısa derslerin tekrar takvimi bunların tamamlandığı anlamına gelmez.

## Doğrulama komutları

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build:pages`, `npm run test:pages`.

Yerel tarayıcı kontrolü: `node scripts/browser-smoke.mjs` (Windows Chrome; farklı kurulumda `CHROME_PATH`). Geçici ve ayrı Chrome profili kullanır; görseller yerel `output/redesign-check/` klasörüne yazılır ve depoya eklenmez.
