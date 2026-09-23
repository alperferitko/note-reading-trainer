# NotaNota — kalan geliştirmeler ve kapsam denetimi

Değerlendirme tarihi: 23 Eylül 2026

## Bu rapor neyi söylüyor?

Bu rapor, depodaki danışmanlık eylem planını, öğrenme yeniden tasarım planını ve mevcut uygulama kodunu karşılaştırır. Eski bir belgede geleceğe yazılmış bir özelliği, bugün kodda varsa yeniden eksik saymaz. Kod incelemesi üretim veritabanının veya dış hizmet ayarlarının doğrulandığı anlamına gelmez. Bu çalışma sırasında üretim hizmetlerinde değişiklik yapılmadı; yeni test çalıştırılması veya canlı dağıtım doğrulaması yapılmadı.

Kaynaklar: [danışmanlık planı](advisory-action-plan.md), [öğrenme uygulama planı](learning-redesign-plan.md), [sıralama kurulumu](weekly-leaderboard-setup.md) ve aşağıdaki kod referansları. Kaynak planlarda “sonraki paket”, “sonraki aday” veya ilk sürümün dışında olarak geçen maddeler, teslim edilmeyen kesin bir ilk sürüm taahhüdü değil, yol haritasıdır. Öncelikler bu denetimin önerisidir; tarih veya efor taahhüdü değildir.

Kullanıcının güncel kararı gereği PWA, uygulama yükleme ve bununla bağlantılı çevrimdışı uygulama paketi eksik iş listesine alınmamıştır.

## Tamamlanan, tekrar eksik sayılmaması gerekenler

- Sol ve fa anahtarı; doğal, diyez ve bemol nota seçenekleri uygulanmış durumda. Eski plandaki “bas anahtarı” maddesi artık sıfırdan yapılacak iş değil. Kanıt: [anahtar seçenekleri](../app/practice-tools.tsx), [nota hesabı](../lib/music-pitch.mjs), [porte çizimi](../app/notation.tsx).
- Piyano ve keman modülleri mevcut. Eski danışmanlık belgesindeki yalnız gitarın kullanılabilir olduğu anlatımı güncelliğini yitirmiştir. Kanıt: [enstrüman çalışması](../app/instrument-trainer.tsx).
- 12 iki dilli kısa ders, bilgi kontrolleri, genel çalışma önerileri ve derslere özel aralıklı tekrar uygulanmış durumda. Bunlar kapsamlı müfredat veya nota düzeyinde uyarlanabilir tekrar demek değildir. Kanıt: [dersler ve öneri motoru](../lib/learning-path.mjs), [tekrar takvimi](../lib/lesson-review.mjs).
- Bağımsız ritim atölyesi ve ilk işitme alıştırması mevcut; “ritim/işitme hiç yok” denemez. Kanıt: [ritim atölyesi](../app/pulse-practice.tsx), [işitme atölyesi](../app/ear-training.tsx).
- Üç özgün sabit okuma etüdü mevcut; “etüt hiç yok” denemez. Kanıt: [etüt verisi](../lib/reading-studies.mjs).
- Yerel oturum geçmişi ve hesaplı kişisel rekor kaydı mevcut. Kalan konu bunların beceri bazlı uzun dönem öğrenme haritasına dönüşmesidir. Kanıt: [yerel ilerleme](../app/local-progress.tsx), [hesap ve skor arayüzü](../app/community.tsx).

## 1. Öncelikli kalan öğrenme geliştirmeleri

### P1 — Nota/soru düzeyinde uyarlanabilir tekrar: kısmen var

**Kaynak statüsü:** Danışmanlık planındaki sık hata yapılan notaları sonraki oturumlara taşıma hedefi; öğrenme planında açıkça sonraki geliştirme.

**Bugün:** `LocalResult`, son 100 oturumu kimlik, modül, doğru/yanlış toplamı, süre ve tarihle saklıyor. `recommendLesson`, son sekiz oturumdaki okuma/gitar/piyano kategorilerinden genel bir temel ders önerebiliyor. Eşik en az iki oturum, on cevap, üç hata ve %30 hata oranı. Oturum içi nota karıştırma analizi ve yanlış soruyu yeniden sorma da var. Ders tekrar takvimi ise bilgi kontrolü düzeyinde 1/3/7/14 günlük aralıklar kullanıyor.

**Eksik:** Oturumlar arasında taşınan soru bazlı kayıt; yazılı nota, oktav, anahtar, değiştirme işareti, aralık/konum, ilk cevap, yardım ve uygun süre bağlamının birlikte tutulması. Bu kayıtla gerçekten hata yapılan nota veya konuma kontrollü ağırlık verme ve sonradan yeniden ölçme yok. Fa anahtarındaki yanlışları, yalnız modül toplamından sol anahtarı zayıflığı diye yorumlamamak gerekir. Mevcut öneri kategorileri keman, işitme ve ritim için ayrı bir tanı modeli içermiyor.

**Tamamlanma ölçütü:** Öğrencinin benzer koşullardaki tekrar eden hatasını sonraki oturumda hedefleyen; yardımlı/yardımsız yanıtı ayıran; az veride teşhis koymayan; neden o çalışmayı önerdiğini açıklayan ve veri silmeye izin veren bir akış. Kalıcılık ve örnekleme testleri eklenmeli.

**Kanıt:** [LocalResult](../app/local-progress.tsx), [recommendLesson](../lib/learning-path.mjs), [ders tekrarları](../lib/lesson-review.mjs), [oturum içi analiz](../lib/session-insights.mjs), [enstrüman kuyruğu](../app/instrument-trainer.tsx).

### P1 — Ölçülü ve suslu okuma etütleri: başlangıç var, kapsam eksik

**Kaynak statüsü:** Öğrenme planında açık kalan geliştirme; ürün yol haritasında sus, ölçü ve donanım çalışmaları aday olarak belirtilmiş.

**Bugün:** Komşu notalar, ilk ek çizgiler ve vuruş içi farklı notalar olmak üzere üç sabit satır bulunuyor. Bunlar sol anahtarı/doğal notalarla sınırlı. Rastgele satır ayrı seçenek; serbest veya ritimli akış mevcut. Sonuçlar nota adı cevapları üzerinden hesaplanıyor.

**Eksik:** Gerçek ölçü bölümlendirmesi, sus olayları, ölçüyü dolduran süre denetimi, donanımın etkisi ve kademeli bir etüt dizisi. Mevcut “Sus ve ölçü” dersinin teorik anlatımı, uygulamalı sus üretimi anlamına gelmiyor. Fa anahtarlı veya değiştirici içeren sabit etütler de mevcut üçlü koleksiyonda yok.

**Tamamlanma ölçütü:** Nota/sus olaylarını ayrı modelleyen, sürelerin ölçü toplamına uyduğunu doğrulayan ve sessizlik sonrasındaki girişi anlamlı biçimde çalıştıran etütler. Nota tanıma doğruluğu ile ritim zamanlaması ayrı raporlanmalı. Eser kütüphanesi genişletilirse içerik/lisans kaynağı ayrıca belirlenmeli.

**Kanıt:** [üç sabit satır](../lib/reading-studies.mjs), [etüt seçimi ve oturumu](../app/score-reading-trainer.tsx), [sus dersinin açık sınırı](../lib/learning-path.mjs), [yol haritası](../app/site-features.tsx).

### P1 — Kısa derslerden kademeli müfredata geçiş: kısmen var

**Kaynak statüsü:** 12 kısa ders ilk sürümde tamamlanmış; tüm enstrümanlarda kapsamlı müfredat ilk sürüm dışında tutulmuş.

**Bugün:** Porte, referans notalar, ek çizgiler, oktav, vuruş/tempo, süreler, alt bölünmeler, sus/ölçü, değiştiriciler, fa anahtarı, gitar ve piyano eşleme konularında 12 ders var. Her ders iki bilgi kontrolü içeriyor. Tamamlama bir enstrüman başarısı olarak sunulmuyor.

**Eksik:** Birden çok aşamalı uygulama ve transfer kontrolü; özellikle keman için ders dizisi, piyano/gitar için başlangıç eşlemenin ötesindeki öğrenme basamakları. İçerik artışı yanında soru çeşitliliği ve aynı iki cevabı ezberleme etkisini azaltan alternatif kontroller gerekli.

**Tamamlanma ölçütü:** Her yeni ders için açık önkoşul, öğrenme hedefi, uygun uygulama bağlantısı, alternatif kontrol soruları ve tekrarda hangi becerinin ölçüldüğünün açıklanması. “Dersi okudu”, “kontrolü geçti” ve “uygulamada gösterdi” farklı durumlar olmalı.

**Kanıt:** [LEARNING_LESSONS](../lib/learning-path.mjs), [ders arayüzü](../app/learning-studio.tsx), [ilk sürüm sınırları](learning-redesign-plan.md).

### P2 — Beceri haritası ve uzun dönem kişisel ilerleme: kısmen var

**Kaynak statüsü:** Danışmanlık planındaki kişisel ilerleme/ustalaşılan notalar haritası yol haritası.

**Bugün:** Oturum sayısı, doğru cevap toplamı, genel doğruluk ve son oturumlar gösteriliyor. Hesaplı en iyi skor ve günlük devamlılık özellikleri ayrı mevcut.

**Eksik:** Anahtar/oktav/nota/konum bazında kanıtlı gelişim görünümü ve karşılaştırılabilir koşullarda zaman içindeki değişim. Ders tamamlandı işareti veya tek bir yüksek doğruluk oranı kalıcı ustalık kanıtı değil. Yerel ders/tekrar/oturum kayıtları cihazlar arasında eşitlenmiyor; bu sınır arayüzde açıklanmış.

**Tamamlanma ölçütü:** Önce P1 soru kaydı; sonra örnek sayısı ve güncelliği görülen beceri haritası. Hesap eşitlemesi ayrıca seçilirse veri kapsamı, birleştirme, silme ve gizlilik gereksinimleri tanımlanmalı. Eşitleme burada mevcut ilk sürümün zorunlu eksiği değil, ek ürün kararıdır.

**Kanıt:** [yerel geçmiş](../app/local-progress.tsx), [öğrenme özeti](../lib/learning-path.mjs), [yerel tekrar açıklaması](../app/lesson-review-plan.tsx), [kişisel rekor](../app/community.tsx).

## 2. Daha geniş ürün yol haritası — mevcut ilk sürüm hatası değil

### P2 — İşitme eğitiminin genişletilmesi

Mevcut alıştırma iki ses arasında daha ince/aynı/daha kalın seçimi; sekiz soruluk geniş veya yakın fark çalışmasıdır. Aralık adlandırma, akor tanıma ve melodik dikte uygulanmış değil. Mevcut sonuç bu ziyaretle sınırlı; kalıcı işitme becerisi geçmişi yok. Yeni türlerin ses üretimi, soru modeli ve değerlendirmesi ayrı yapılmalı; yalnız perde yönü sonucundan genel müzik yeteneği çıkarılmamalı. Kanıt: [işitme arayüzü](../app/ear-training.tsx), [soru modeli](../lib/ear-training.mjs), [ilk işitme paketinin kapsamı](learning-redesign-plan.md).

### P2 — Ritim atölyesinin kapsamı

15–120 BPM, hazırlık vuruşları, sekiz dokunuş ve yaklaşık zamanlama geri bildirimi mevcut. Henüz farklı nota/sus örüntülerini icra etmeye dayalı kapsamlı ritim değerlendirmesi değil. Cihaz gecikmesi sınırı korunmalı; ileride sus, alt bölünme ve değişen örüntüler ayrı hedeflerle değerlendirilmelidir. Kanıt: [atölye](../app/pulse-practice.tsx), [dokunuş değerlendirmesi](../lib/pulse-practice.mjs).

### P2/P3 — Enstrüman kapsamı

Piyano modülü sol veya fa anahtarında iki oktavlık tek klavye aralığı ve isteğe bağlı siyah tuşlarla çalışıyor; eşzamanlı çift porte okuma yok. Keman standart Sol–Re–La–Mi akordunda birinci pozisyon/doğal nota eşlemesi sunuyor; ileri pozisyonlar yok. Bağlama, eski yol haritasında anılıyor ancak mevcut rota ve modüllerde bulunmuyor. Bunlar tamamlanmış piyano/keman modülünü yok saymayı değil, ayrı genişleme paketlerini gerektirir. Kanıt: [enstrüman kodu](../app/instrument-trainer.tsx), [rota listesi](../lib/site-routes.mjs), [aday özellikler](../app/site-features.tsx), [eski plan](advisory-action-plan.md).

### P3 — Gerçek enstrüman değerlendirmesi

Mevcut gitar/piyano/keman çalışmaları ekrandaki cevap/konum seçimini değerlendiriyor; çalınan gerçek ses veya MIDI girdisini ölçmüyor. `app` ve `lib` incelemesinde mikrofon açma (`getUserMedia`) veya MIDI giriş izni (`requestMIDIAccess`) akışı bulunmadı. Ses üretiminde MIDI sayı değerinin kullanılması, MIDI cihaz bağlantısı desteği değildir.

Mikrofon/MIDI için cihaz izinleri, desteklenmeyen tarayıcı davranışı, gecikme ve kalibrasyon, hata toleransı, giriş kesilmesi, ses verisinin saklanıp saklanmayacağı ve tek/çok sesli kapsam tasarlanmalı. Bu araştırma ve doğrulama gerektiren ayrı bir ürün paketi; mevcut sürüm için tamamlanmış olarak sunulmamalı. Kanıt: [enstrüman değerlendirmesi](../app/instrument-trainer.tsx), [gitar modülü](../app/guitar-trainer.tsx), [ses üretimi](../lib/practice-audio.ts), [açık kapsam sınırı](learning-redesign-plan.md).

### P3 — Öğretmen/sınıf/sınav araçları

Öğretmen paneli, öğrenciye atanmış çalışma, sınav modu ve sınıf yönetimi mevcut uygulamanın tamamlanan özellikleri değil. Genel paylaşım araçları öğretmen ödevi/öğrenci takibi anlamına gelmez. Önce roller, onay ve veri görünürlüğü, ödev tanımı ve değerlendirme kapsamı belirlenmeli. Çalışma sayfaları da eski planın ayrı adayıdır. Kanıt: [eski yol haritası](advisory-action-plan.md), [öğrenme planının sınırları](learning-redesign-plan.md), [mevcut site araçları](../app/site-features.tsx).

### Anahtar kapsamı: yalnız sol ve fa

Tip tanımı ve çizim/dönüşüm mantığı yalnız `treble` ve `bass` destekliyor. Alto/tenor gibi do anahtarları veya diğer anahtarlar uygulanmış değildir. İncelenen planlarda bunların teslim edilmiş olduğu söylenmediğinden, bunları eksik ilk sürüm taahhüdü olarak yazmak doğru olmaz. İstenirse ayrıca kapsamlandırılmalıdır; yalnız yeni bir simge çizmek yeterli değildir, nota konumu ve ses hesabı da değişir. Kanıt: [Clef tanımı](../app/practice-tools.tsx), [nota dönüşümü](../lib/music-pitch.mjs), [porte](../app/notation.tsx).

## 3. Kod hazır olsa da operasyon gerektiren işler

### P1 — Haftalık ve kullanıcı adı filtreli sıralamanın veritabanı kurulumu

Ön yüz ve SQL migration mevcut; depodaki dağıtım belgesi migration'ın üretime uygulanmadığını ve SQL davranış testlerinin tamamlanmadığını açıkça kaydediyor. Bu rapor canlı veritabanına bağlanmadığı için bu son belgelenmiş durumun sonradan değişmediğini bağımsız olarak doğrulamıyor.

Veritabanı operatörü önce yerel/staging ortamında migration'ı çalıştırmalı; anonim yazma engeli, profilsiz kullanıcı reddi, geçersiz sürelerin iki tabloya da yazılmaması, haftalık ve ömür boyu rekor ayrımı, sıralamadan önce kullanıcı filtresi ve hesap silme zinciri sınanmalı. Sonra yetkili üretim uygulaması ve arayüz doğrulaması yapılmalı. Önceki haftaların geçmişi mevcut yaşam boyu en iyi skorlardan üretilemez.

“Arkadaş” filtresi en çok 50 açık kullanıcı adına göre liste süzer; arkadaşlık isteği/onayı veya sosyal ağ sistemi değildir. Böyle bir sistem ayrıca talep edilmedikçe eksik olarak sayılmamalıdır.

Kanıt: [kurulum ve test önkoşulları](weekly-leaderboard-setup.md), [migration](../supabase/migrations/202609200001_weekly_and_friend_leaderboards.sql), [filtre arayüzü](../app/community.tsx), [sıralama istemcisi](../lib/leaderboard.ts).

### Operasyonel takip — tamamlandığı bu incelemede doğrulanmayanlar

Eski eylem planında KVKK yurt dışı aktarım mekanizmasının hukukçu ile tamamlanması, Search Console/Bing doğrulaması ve site haritası gönderimi, Supabase OTP/bot koruması incelemesi bulunuyor. Bunlar kaynak koddan doğrulanamaz; ilgili sorumludan güncel kanıt gerekir. Bu rapor hukuki uygunluk değerlendirmesi yapmaz.

Tam HTTP güvenlik başlıkları için farklı barındırma/proxy ve ciddi rekabet için sunucu tarafından başlatılan/zamanlanan oturumlar koşullu mimari adaylardır; otomatik olarak onaylanmış uygulama işi değildir. E-posta alımının ve hesap silme özelliğinin eski belgede doğrulandığı kısımlar yeniden “hiç yapılmadı” diye listelenmemiştir. Kanıt: [operasyon maddeleri](advisory-action-plan.md), [kurulum kontrol listesi](community-setup.md).

## 4. Dokümantasyon tutarlılığı — güncellenenler ve kalan takip

- Genel ürün yol haritası güncellendi: 12 kısa ders ve ders tekrarları, üç sabit etüt, eşit vuruş atölyesi ve perde yönü çalışması kullanılabilir olarak listeleniyor. Aralık adlandırma, akor tanıma ve melodik dikte gelecek adaylarından ayrıştırıldı.
- PWA/yükleme kaldırma işi tamamlandı; kullanıcının son kararı doğrultusunda açık geliştirme olarak takip edilmiyor.
- Danışmanlık planı tarihsel belge olarak korunuyor. Eski “gitar kullanılabilir, piyano/keman sırada” anlatımı güncel durum değildir; bu raporun tamamlananlar bölümü ve güncel ürün yol haritası esas alınmalı. Tarihsel hukuk/operasyon maddeleri bu metin güncellemesiyle tamamlanmış sayılmaz.
- Üretim migration durumunun tarihi ve doğrulama kanıtı, gerçekten uygulandığında kurulum belgesine eklenmeli; kodun varlığı yeterli kabul edilmemeli.

Kanıt: [eski eylem planı](advisory-action-plan.md), [ürün metinleri](../app/site-features.tsx), [veritabanı durum belgesi](weekly-leaderboard-setup.md).

## Önerilen uygulama sırası

1. Haftalık sıralama için yetkili staging veritabanı ve çalışma testlerini sağla; uygulama sonrası dağıtım belgesini kanıtla güncelle.
2. Soru düzeyinde yerel kayıt ve kanıta dayalı uyarlanabilir tekrar altyapısını kur.
3. Bu altyapıyla beceri ilerlemesi görünümünü geliştir; eşzamanlı olarak ölçülü/suslu etüt modelini ve kademeli dersleri genişlet.
4. İşitme/ritim çeşitlerini ve enstrüman kapsamını bağımsız, ölçülebilir küçük paketlerle artır.
5. Gerçek enstrüman girdisi, öğretmen/sınıf araçları ve ek anahtarları ancak ayrı ürün kararı ve kapsamlandırma sonrasında ele al.

Özet: En büyük açık “hiç ders/ritim/işitme/enstrüman yokluğu” değil; var olan başlangıç çalışmalarının soru düzeyinde ölçülen, oturumlar arasında devam eden ve daha geniş müfredata bağlanan bir öğrenme sistemine dönüşmesidir.
