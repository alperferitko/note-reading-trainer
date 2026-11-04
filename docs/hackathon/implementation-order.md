# Uygulama sırası ve teslim kapıları

30 Ekim 2026. Teslim hedefi kullanıcı beyanıdır: 4 Kasım 2026 21.00 ET.
Bu liste otomatik uygulama/deploy onayı değildir.

| Dilim | Öncelik / durum | Minimum kabul kapısı |
| --- | --- | --- |
| B4 | Staging üzerinde gerçek Meta AI doğrulaması — **yalnız hazırlık tamamlandı, aktivasyon bekliyor** | Ayrı proje/pin; gerçek SQL yarış/izin testleri; Edge paketleme; staging Auth; hesapta model doğrulama; ayrı onaylı tek sentetik ücretli istek; ledger/replay/kill switch kontrolü |
| C1 | MusicXML'den çalışma oturumuna dönüşüm — plan | Küçük tek sesli XML/MXL örneği; güvenli parse/boyut sınırı; nota/es/ölçü/accidental/tie; kaynak korunur; desteklenmeyen yapı açık hata; mevcut deterministik oturum/kanıt üretimi |
| C2 | Tek sesli canlı mikrofon performans analizi — plan | İzin/cihaz temizliği; sessizlik/gürültü/düşük güven; Hz/cents ve onset/timing ayrımı; cihaz gecikmesi; kayıt varsayılan cihazda; gerçek referans ses testleri |
| C3 | Kişiselleştirilmiş öğrenme hedefleri — plan | Gün/süre hedefi; kanıta bağlı küçük öneri; yetersiz veri durumu; ücretsiz alternatif; yeni abonelik yok |
| C4 | Hackathon final demo ve teslim — plan | Gerçek ve DEMO ayrımı; çalışan kapsam videosu; test ve eksik listesi; lisans atıfları; anahtar/JWT görünmeyen kayıt; teslim zamanından önce içerik dondurma |
| D1 | PDF/fotoğraf OMR — plan | Kuyruklu ayrı işlem; dosya güvenliği; düzeltme ekranı; kod/model/veri lisans incelemesi; hata öğrenciye yazılmaz |
| D2 | Gelişmiş partisyon sadeleştirme — plan | Değişmez kaynak; sürümlü türev ve fark; müzikal doğruluk ve telif kontrolü |
| D3 | Ortak eser kütüphanesi ve kullanıcı gönderimleri — plan | Lisans/kaynak manifesti; müzikal doğrulama; moderasyon ve kaldırma prosedürü |
| D4 | Sosyal özelliklerin genişletilmesi, kapsamlı müfredat ve abonelik — plan | İsteğe bağlı paylaşım; karşılaştırılabilir sıralama; gizlilik; pedagojik inceleme; ayrı maliyet/ödeme onayı |

## B4 ile ürün demosu arasındaki eksik adım

Mevcut öğretmen paneli backend çağırmıyor. Backend smoke testi başarılı olsa bile
panelin canlı olduğu söylenemez. Ayrı onaylı küçük bir iş olarak staging Auth ve
origin ile nota okuma oturumunu schema-v1 isteğine bağlamak, `live`/`mock`/
`deterministic` durumlarını ayrı göstermek ve kota/ağ hatasında ücretsiz çalışmayı
korumak gerekir. Yeni özelliklerden önce bu uçtan uca yol doğrulanmalı.

## Zaman kutulama önerisi (taahhüt değil)

- 30 Ekim–1 Kasım: B4 engelleri, staging/CI ve sentetik smoke için kullanıcı onayları.
- 2–3 Kasım: yalnız B4 geçerse minimal ürün bağlantısı; C1–C3 için ayrı go/no-go.
- 4 Kasım: C4 kanıt/toparlama; yetişmeyen C1–C3 roadmap olarak kalır, güvenlik
  kapıları teslim baskısıyla kaldırılmaz.
- ET için America/New_York kullan; sabit yaz saati ofseti varsayma. Teslim portalı
  ve saat dönüşümü kullanıcı tarafından son kez teyit edilir.

## Ortak değişmezler

Ücretsiz öğrenme korunur; üretim projesi kullanılmaz; model ölçüm üretmez.
Yeni bağımlılık, commit/push, SQL uygulama, secret değişimi, deploy ve ücretli test
ayrı izin gerektirir. Her dilimde test raporu ve uygulanmayan kapsam açık kalır.