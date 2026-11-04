# Açık kaynak aday incelemesi

İnceleme: 30 Ekim 2026; yalnız birincil repo README, lisans ve manifest sayfaları.
Klonlama, kaynak/model indirme, çalıştırma veya bağımlılık ekleme yapılmadı.
Varsayılan dal içerikleri değişebilir; entegrasyon onayında exact commit/tag,
transitive bağımlılıklar, model ağırlıkları ve veri lisansları yeniden incelenmeli.
Zorluk ve uyumluluk sütunları NotaNota için mühendislik değerlendirmesidir;
upstream performans iddiaları burada doğrulanmış benchmark değildir.

## Karşılaştırma

| Depo | Doğrulanan iş / somut aday | Lisans ve ticari kullanım etkisi | React/TS uyumu / sınır | Bağımlılık ve bakım riski | Zorluk |
| --- | --- | --- | --- | --- | --- |
| NoteLite [N] | PDF/görüntü OMR, MusicXML/MIDI, skor düzeltme ve rehberli çalışma; import/export ve practice tasarımını referans alma | Karışık: kök MIT, Audiveris-türevi kaynaklarda AGPL-3.0-or-later. Uygulamanın tamamı MIT değildir; dosya bazlı menşe ve birleşik dağıtım incelemesi şart | Java 21 masaüstü, web practice ve native Apple bileşenleri; React'e doğrudan uygulama olarak gömülemez | Java/Gradle, tanıma köprüsü, platform paketleme; küçük testler genel doğruluk kanıtı değil; geniş çatallama bakımı | Yüksek |
| homr [H] | Fotoğraftan MusicXML; dewarp/staff reconstruction ve transformer tanıma, OMR aday servisi | Kod AGPL-3.0; ağırlıklar ayrıca veri kökeni incelemesi ister. FAQ ticari kullanımda belirsiz/NC veri riskini bildiriyor; otomatik ticari onay yok | Python/ONNX işlem servisi; TS'ye MusicXML/iş durumu ile sınır | Model ve OCR indirmeleri, CPU/GPU maliyeti; veri lisansı çözülmeden ürünleşme yok | Yüksek |
| oemer [O] | Fotoğraf OMR → MusicXML; dewarping, staff/symbol çıkarma | Kod MIT, ticari kullanım bildirim koşullarıyla mümkün; ağırlık/veri ve bağımlılık hakları ayrı doğrulanmalı | Python worker/API, tarayıcıya doğrudan taşıma değil | ONNX Runtime, OpenCV, SciPy/scikit-learn; platforma göre GPU runtime; model kurulumu ve bozuk taramalarda kalite | Yüksek |
| OpenSheetMusicDisplay [S] | MusicXML renderer ve erişilebilir veri modeli; skor görüntüleme/cursor/işaretleme adayı | BSD-3-Clause; atıf/bildirim ve endorsement koşulları korunur; açık çekirdek ile ayrı premium bileşenler karıştırılmaz | TypeScript/browser; client-only React ref/effect sarmalayıcı ve lazy yükleme uygun | VexFlow ve render yaşam döngüsü; paket boyutu, responsive layout ve XML kapsam regresyonları; renderer eğitim parser'ının yerini tutmaz | Orta |
| pitchy [P] | McLeod Pitch Method, frekans/clarity; tek sesli mikrofon ölçümü adayı | 0BSD; ticari kullanıma izin; fft.js ve dağıtım bağımlılıkları ayrıca incelenir | ESM + TS tanımları; Web Audio tamponlarına uygun, UI'dan ayrı DSP modülü | fft.js; pitch≠onset/ritim. Gürültü, oktav hatası ve cihaz gecikmesi için kendi testlerimiz gerekli | Düşük (detector); tam performans akışı orta |
| basic-pitch-ts [B] | Audio→nota/MIDI, pitch bend ve polyphonic olay çıkarma; ileride offline kayıt analizi | Apache-2.0; lisans/NOTICE/değişiklik ve patent şartları uygulanır; eser hakları sağlamaz | TS/AudioBuffer, tarayıcı mümkün; Worker ve ayrı model asset yüklemesi değerlendirilmeli | TensorFlow.js 3.x manifesti, model dosyaları ve bellek/WebGL maliyeti; gerçek zamanlı düşük gecikme garantisi yok; modern tarayıcı uyumu test edilmeli | Yüksek |
| music21 [M] | Sembolik analiz, MusicXML dönüştürme/validasyon, tonal/ritmik işlemler; sunucu/offline doğrulama | Kod BSD-3-Clause; corpus/eser lisansları aynı kabul edilmez | Python; React/Edge'e doğrudan bağımlılık değil, servis veya build-time JSON/MusicXML sınırı | Python sürümü ve opsiyonel harici nota araçları; corpus hakları, parser farklılıkları, ayrı servis bakımı | Orta (ayrı worker), yüksek (Edge'e taşıma) |
| MutopiaProject [U] | LilyPond kaynaklı partisyon arşivi; küçük editör onaylı eser havuzu adayı | Tek repo lisansı varsayılmaz: eser bazında Public Domain, CC BY, CC BY-SA ve sürümleri; atıf/ShareAlike türev koşulları kaydedilir | Runtime kütüphanesi değil; offline kürasyon + sürümlü katalog; MusicXML dönüşümü ayrıca doğrulanır | LilyPond sürümleri, kaynak edisyon ve bölgesel haklar; gönüllü arşiv, kalite garantisi yok | Orta |

## AGPL kapısı

Audiveris AGPLv3 kaynak ve lisansı [A] ayrıca incelendi. NoteLite'ın MIT kök
dosyasını Audiveris-türevi dosyaların lisansını ortadan kaldıran izin sayma.
homr'u ayrı HTTP servisine koymak **tek başına bütün lisans yükümlülüklerini
kaldırmaz**. AGPL ticari kullanımı kategorik yasaklamaz; kapsanan dağıtım/ağ
etkileşimi, değişiklik ve Corresponding Source yükümlülükleri hukuk incelemesi ister.
Bu bir hukuki uygunluk sertifikası değildir. Kapalı ürüne kaynak kopyalama veya
AGPL servis çalıştırma bu aşamada onaylanmadı.

homr FAQ, model ağırlıklarının eğitim veri lisanslarının etkisini açık bir hukuki
soru olarak ayırıyor. Bu nedenle kod AGPL koşulları karşılansa bile ağırlıklar için
ticari kullanım onayı varsayılmayacak. oemer'in MIT kod lisansı da tüm veri/model
zincirinin temiz olduğuna dair kanıt sayılmayacak.

## Önerilen seçim (henüz entegrasyon yok)

- C1: Önce küçük kendi deterministik MusicXML→session sınırı; gerekirse OSMD yalnız
  görünüm için. MXL zip bomb/path traversal ve XML external entity/DTD risklerini
  boyut/entry/decompression limitleriyle ele al. Her yeni bağımlılık önce onaylanır.
- C2: Tek ses için pitchy ilk prototip adayı; onset/timing ayrı DSP ve kalibrasyon.
- D1: homr/oemer ayrı benchmark + lisans kapısı; NoteLite/Audiveris referans,
  kopyalanacak varsayılan teknoloji değil.
- D2–D3: music21 offline doğrulama, Mutopia eser bazlı lisans manifesti.
- Çok ses: basic-pitch-ts daha sonraki deney; C2'yi buna bağlayıp şişirme.

Bakım değerlendirmesi manifest, test/dokümantasyon ve mimari yük üzerinden yapıldı;
son commit tarihleri/maintainer SLA'sı doğrulanmadı. Hiçbir adayın mevcut NotaNota
build'iyle uyumluluğu henüz çalıştırılarak kanıtlanmadı.

## Birincil kaynaklar

- [N] https://github.com/Lucas0623z/NoteLite — README lisans bölümü;
  https://github.com/Lucas0623z/NoteLite/blob/main/LICENSE
- [H] https://github.com/liebharc/homr — README;
  https://github.com/liebharc/homr/blob/main/LICENSE_FAQ.md ;
  https://github.com/liebharc/homr/blob/main/pyproject.toml
- [O] https://github.com/BreezeWhite/oemer ;
  https://github.com/BreezeWhite/oemer/blob/main/LICENSE ;
  https://github.com/BreezeWhite/oemer/blob/main/setup.py
- [S] https://github.com/opensheetmusicdisplay/opensheetmusicdisplay ;
  https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/LICENSE ;
  https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/package.json
- [P] https://github.com/ianprime0509/pitchy ;
  https://github.com/ianprime0509/pitchy/blob/main/LICENSE ;
  https://github.com/ianprime0509/pitchy/blob/main/package.json
- [B] https://github.com/spotify/basic-pitch-ts ;
  https://github.com/spotify/basic-pitch-ts/blob/main/LICENSE ;
  https://github.com/spotify/basic-pitch-ts/blob/main/package.json
- [M] https://github.com/cuthbertLab/music21 ;
  https://github.com/cuthbertLab/music21/blob/master/LICENSE
- [U] https://github.com/MutopiaProject/MutopiaProject ;
  https://www.mutopiaproject.org/legal.html
- [A] https://github.com/Audiveris/audiveris/blob/master/LICENSE