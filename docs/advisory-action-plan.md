# NotaNota danışmanlık raporu — uygulama planı

Son değerlendirme: 26 Temmuz 2026

Bu belge, danışmanlık raporundaki önerilerin kod ve operasyon tarafındaki karşılığını izler. “Tamamlandı” maddeleri bu repoda uygulanmıştır; dış hizmet veya hukuki karar isteyenler ayrıca işaretlenmiştir.

## Bu sürümde tamamlananlar

- Nota okuma ve gitar sorularına Web Audio tabanlı dinleme düğmesi eklendi.
- Doğru veya yanlış cevaptan sonra doğru perde kısa bir sesle çalınıyor.
- Ses açma/kapama tercihi cihazda saklanıyor; otomatik çalma yapılmıyor.
- Mobilde Stüdyo, Nota Oku ve Gitar arasında geçiş sağlayan erişilebilir alt menü eklendi.
- Türkçe ana meta açıklaması, canonical URL ve EducationalApplication yapılandırılmış verisi eklendi.
- JavaScript kapalıyken ve arama motoru ilk HTML’i okurken görülebilen anlamlı içerik eklendi.
- `robots.txt`, `sitemap.xml`, markalı `404.html` ve `.well-known/security.txt` eklendi.
- Statik uygulamaya uyumlu temel CSP ve referrer politikası eklendi.
- Sıralama boş durum metni soğuk başlangıç için “İlk sırayı sen aç” yaklaşımına geçirildi.
- “Modülü aç” ve “Bol şans” gibi mekanik metinler eylem odaklı, daha doğal metinlerle değiştirildi.
- Yakın tarih vermeyen “Piyano yakında” metni arayüzden kaldırıldı.
- Canlı KVKK ekranındaki iç geliştirme notu kaldırıldı; mevcut veri akışı ve yurt dışı sağlayıcılar açık biçimde anlatıldı.
- Raporlanan “Tekrar listen” ifadesinin noktalaması düzeltildi.
- Hesap paneline, açık onay ifadesi ve üretimdeki kimlik doğrulamalı Edge Function üzerinden çalışan kendi hesabını silme akışı eklendi.
- Kullanıcı hesabı silindikten sonra bekleyen yerel skor ve Supabase oturumu temizleniyor; hata durumunda hesap açık kalıyor ve güvenli bir yeniden deneme mesajı gösteriliyor.
- KVKK metni, hesabın panelden silinebileceğini veya kayıtlı e-posta adresinden silme talebi iletilebileceğini açıklayacak biçimde güncellendi.

## Daha önce tamamlanmış ve doğrulananlar

- Supabase tablolarında RLS etkin; kullanıcıların özel hesap ve çalışma günü verileri kullanıcıya bağlı.
- Kullanıcı e-postası sıralamada yayımlanmıyor.
- Skor RPC’si hatalı oturumları, beklenmeyen seviye sayılarını ve gerçek dışı çok kısa yanıtları reddediyor.
- Mobil cevap tuşları ve etkileşim hedefleri en az 44 piksel.
- İlk yanlışta biten sonsuz mod, günlük seri ve nota karıştırma analizi mevcut.
- Sonuç ekranı kişiselleştirilmiş öğrenme geri bildirimi ve tekrar odağı gösteriyor.

## Sonraki geliştirme paketi

1. Web Audio sentezi yerine lisansı doğrulanmış piyano ve klasik gitar örnekleri.
2. Bas anahtarı, büyük porte ve diyez/bemol seviyeleri.
3. Aralıklı tekrar: sık hata yapılan notaları sonraki oturumlara ölçülü biçimde taşıma.
4. Kişisel rekor ve ustalaşılan notalar haritası; genel sıralamaya alternatif kişisel ilerleme görünümü.
5. Ritim okuma, piyano klavyesi, bağlama ve işitme eğitimi.
6. Öğretmen paylaşım bağlantıları, sınav modu ve arama odaklı ücretsiz çalışma sayfaları.
7. PWA ve çevrimdışı çalışma; daha sonra MIDI/mikrofon ve sınıf özellikleri.

## Kullanıcı/operasyon yardımı gerekenler

- **KVKK yurt dışı aktarımı:** Supabase ve Resend için uygulanacak KVKK madde 9 aktarım mekanizması bir hukukçu ile seçilmeli ve tamamlanmalı. Kod içinde tamamlanmış gibi gösterilmiyor.
- **Başvuru kanalı:** `kvkk@notanota.online` ve `security@notanota.online` adreslerinin gelen posta alabildiği 27 Temmuz 2026 tarihinde doğrulandı.
- **Arama motorları:** Google Search Console ve Bing Webmaster Tools üzerinde alan adı doğrulanmalı; `https://notanota.online/sitemap.xml` gönderilmeli.
- **Supabase Auth:** OTP gönderim sınırı ve bot koruması proje panelinde gözden geçirilmeli.
- **HTTP güvenlik başlıkları:** GitHub Pages özel yanıt başlığı ekleyemediği için tam `frame-ancestors`, HSTS ve benzeri başlıklar isteniyorsa alan adı Cloudflare proxy veya başlık destekleyen statik barındırmaya taşınmalı.
- **Ses örnekleri:** Örnek tabanlı sese geçmeden önce seçilecek piyano/gitar paketlerinin lisans ve atıf metni onaylanmalı.
- **Skor güveni:** Mevcut sunucu doğrulaması temel kötüye kullanımı engelliyor; ciddi rekabet hedeflenirse sunucu tarafından başlatılan ve zamanlanan oturum sistemi için ürün kararı gerekir.

## Bilinçli olarak ertelenenler

- Kalp/enerji, ceza serisi, suçluluk bildirimleri ve yabancılarla zorunlu ligler ürünün sakin çalışma yaklaşımına uymadığı için planlanmıyor.
- Sahte örnek skorlar veya boş tabloyu dolduran hayali kullanıcılar eklenmiyor.
- Ayrı bir gerçek İngilizce URL yapısı oluşmadan `hreflang` eklenmiyor.
