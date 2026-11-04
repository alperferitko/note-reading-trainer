# NotaNota ürün yol haritası

Durum tarihi: 30 Ekim 2026. Bu belge ürün vizyonudur; aşağıdaki planlar
uygulanmış özellik beyanı değildir. Kullanıcının bildirdiği teslim:
**4 Kasım 2026, 21.00 America/New_York (ET)**.

## Temel ilke

Müzik öğrenme, mevcut egzersizler, dersler ve temel ilerleme özellikleri ücretsiz
kalacak. Ücretli AI seçenekleri yalnızca daha gelişmiş kişisel rehberlik ve işlem
yoğun özellikler sağlayabilir. AI bağlantısı, kota veya abonelik yokluğu temel
öğrenmeyi durdurmayacak. Bu aşamada abonelik veya ödeme sistemi geliştirilmiyor.

## Bugünkü sınır

- Mevcut nota okuma, dersler, ritim/işitme/enstrüman çalışmaları, ilerleme ve
  leaderboard korunuyor; bütün yeni vizyonun tamamlandığı ileri sürülmüyor.
- B2 öğretmen alanı nota okuma sonuçlarında cihaz içi DEMO'dur; Meta yanıtı değildir.
- B3 backend/ledger/workflow hazırlanmıştır; gerçek PostgreSQL, Edge ve Meta
  hesabıyla doğrulama henüz tamamlanmamıştır. B4 hazırlığı aktivasyon değildir.
- Yeni MusicXML/MXL içe aktarma, OMR ve canlı mikrofon performans değerlendirmesi
  bu dilimde uygulanmadı. Mevcut ekran cevapları ses kaydı/entonasyon ölçümü değildir.

## Kullanıcı öğrenme yolları — hedef

1. **Müzik teorisi:** kısa ders, bilgi kontrolü, örnek ve aralıklı tekrar.
2. **Bir müzik aleti:** enstrümana özel yol; ekran üzerindeki bilgi ile gerçek
   çalma ölçümünü ayrı tutan yönlendirme.
3. **Nota okuma ve sight-reading:** anahtar, perde, oktav, es ve süreyi
   kademeli birleştiren kısa oturumlar.
4. **Kısa seviye belirleme:** yeterli yardımsız örnek olmadan kesin seviye atamama;
   geçmişi ve ölçüm kapsamını kullanıcıya gösterme.
5. **Haftalık hedefler:** çalışma günü ve süre hedefi, kullanıcının değiştirebildiği
   küçük planlar; kaçırılan günler için cezalandırıcı dil yok.
6. **Kişisel beceri haritası ve adaptif alıştırma:** deterministik kanıtla seçim;
   model açıklama üretir, ölçüm veya başarı puanı uydurmaz.
7. **Streak, ödüller ve ücretsiz haftalık AI geri bildirimi:** streak altyapısı
   korunur; yeni ödüller ve haftalık AI hakkı gelecek hedeftir. Haftalık AI henüz
   etkin değildir; maliyet/kota sürdürülebilirliği doğrulanmadan vaat edilmez.

## Müzik teknolojileri — hedef

- **MusicXML/MXL içe aktarma:** önce küçük, tek sesli destek kümesi. Kaynak
  dosyanın değişmez kopyası + sürümlü normalize çalışma verisi.
- **Yapılandırılmış analiz:** nota, es, ölçü, bağ (tie/slur ayrımı), anahtar,
  ölçü birimi, diyez/bemol ve ölçü içi accidental kapsamı. Desteklenmeyen
  tuplets/voices/repeats açıkça reddedilir veya uyarılır; sessizce nota atılmaz.
- **Çalışma varyantı:** orijinali koruyarak tempo, bölüm, tekrar veya sadeleştirilmiş
  türev üretme; değişiklik günlüğü ve kaynak/lisans bilgisi.
- **PDF/fotoğraf OMR:** daha sonra asenkron tanıma, insan düzeltmesi ve onay.
  OMR hatası öğrencinin çalma hatası sayılmaz.
- **Canlı mikrofon:** ilk kapsam tek ses; Hz/cents ve onset/vuruş hatası DSP'den,
  açıklama Meta'dan. Sessizlik, gürültü, izin reddi, düşük güven ve cihaz gecikmesi
  ayrı durumlar. Ses varsayılan olarak cihazda kalır.
- **Daha sonra MIDI ve çok sesli analiz:** ayrı cihaz/izin ve performans testleri;
  tek sesli pitch detector çok sesli motor gibi sunulmaz.

## Sosyal sistem — hedef

- Mevcut leaderboard ve ücretsiz erişim korunur.
- Eser bazlı sıralama ancak aynı eser sürümü, bölüm, tempo, girdi türü,
  tekrar/yardım kuralları ve puanlama sürümünde karşılaştırılır.
- Profil ve **isteğe bağlı** herkese açık ilerleme; varsayılan özel, görünürlüğü
  geri alma ve veri silme akışı.
- Onaylı eser kütüphanesi: sürümlü müzikal doğrulama, lisans/kaynak kaydı,
  atıf ve gerektiğinde türev lisans yükümlülüğü.
- Kullanıcı gönderimleri: karantina → dosya güvenliği → müzikal kontrol →
  telif/lisans incelemesi → editör onayı. Kullanıcı beyanı tek başına yeterli değil.

## Hackathon kapsamını koruma

Öncelik B4'te tek güvenli gerçek Meta geri bildirimi ve sonrasında onaylı minimal
staging ürün bağlantısıdır. Yeni OMR servisi, çok sesli analiz, sosyal ağ ve abonelik
teslimi bloke etmez; D aşamasına kalır. C1–C3 yetişmezse çalışan özellikmiş gibi
demo edilmez; C4'te yalnız doğrulanmış kapsam gösterilir.

Sıra ve kabul kapıları: `implementation-order.md`.
Kaynak adayları ve lisans riskleri: `open-source-assessment.md`.
Aktivasyon engelleri ve onaylar: `meta-staging-readiness.md`.