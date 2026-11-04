# Implementation sprint, 2 Kasım 2026 (dal: hackathon/notanota-ai)

Bu belge yapılanı, durumu ve onay bekleyen adımları kaydeder. **Commit, push, migration, deploy,
secret ve ücretli çağrı yapılmadı.** Production'a dokunulmadı.

## Durum özeti

| Alan | Durum |
| --- | --- |
| Yeni tasarım (frost/slate, TASA Orbiter + Switzer + Figtree) | Uygulamada. Tüm ekranlar tema değişkenleriyle; ana sayfa, üst bar, AI paneli, MusicXML ve mikrofon ekranları yeni bileşenler |
| Ana sayfadan çalışmaya erişim | Tek tık: "Nota çalışmaya başla" doğrudan oturumu açar. Uçtan uca yerel tarayıcı testiyle doğrulandı |
| Kaldığın yerden devam / öneri | Gerçek kanıttan (`lib/practice-plan.mjs`); tek işlemle önerilen çalışma başlar |
| Hedefler (C3) | Cihazda; günlük cevap ve haftalık gün hedefi ölçülen cevaplardan sayılır. Yeni tablo yok |
| AI Öğretmen | Gerçek gateway'e bağlanabilir. Bu derlemede gateway URL'si yok, panel `deterministic` gösterir |
| Ledger settlement (B4) | Yeni migration **dosyası** + gerçek PostgreSQL (PGlite) testleri. Uygulanmadı |
| Edge paketleme | Fonksiyon ağacı artık kendi klasörü dışına import etmiyor; Deno 2.5.6 check ve Edge testi yerelde geçti |
| MusicXML (C1) | Çalışıyor: güvenli ayrıştırıcı, OSMD görüntüleme, ölçü aralığı, adla veya mikrofonla çalışma, ortak sonuç ve AI paneli |
| Mikrofon (C2) | Çalışıyor: izin yalnız tıklamayla, kararlılık eşikleri, belirsiz ses ayrı, akışlar kapanır, ses yüklenmez |
| Canlı Meta çağrısı | **Yapılmadı.** Model listesi, fiyat, şema desteği doğrulanmadı |

## Değişen ve eklenen ana dosyalar

- Arayüz: `app/home-hub.tsx`, `app/home-hub.css`, `app/frost.css`, `app/fonts/*`, `app/layout.tsx`, `app/page.tsx` (yeni aşamalar, tek tık başlatma), `lib/site-routes.mjs`
- AI: `app/ai-teacher.tsx`, `app/ai-teacher.css`, `lib/ai-client.mjs`, `env.d.ts` (`VITE_AI_GATEWAY_URL`)
- B4: `supabase/migrations/202611020001_ai_usage_settlement_reconcile.sql`, `supabase/tests/ai-usage-reconcile.test.sql`, `scripts/sync-edge-shared.mjs`, `supabase/functions/_shared/vendor/practice-evidence.mjs` (üretilmiş), `supabase/functions/_shared/ai/staging-target.mjs` (üretilmiş), `staging-config.mjs` + `staging-gateway.mjs` (`META_RESPONSE_FORMAT`), `http-handler.mjs` (Deno tip düzeltmesi), `.github/workflows/ai-staging.yml`
- C1/C2/C3: `lib/musicxml.mjs`, `lib/samples/ode-to-joy.musicxml`, `app/score-workspace.tsx`, `lib/pitch-detect.mjs`, `app/use-mic-pitch.ts`, `app/mic-practice.tsx`, `app/practice-lab.css`, `lib/practice-plan.mjs`
- Bağımlılıklar: `opensheetmusicdisplay@2.2.1` (BSD-3-Clause; jszip MIT/GPL çift, vexflow MIT), `pitchy@4.1.0` (MIT; fft.js MIT), geliştirme için `@electric-sql/pglite@0.5.14` (Apache-2.0). OSMD yalnız partisyon sayfasında ayrı parça olarak yüklenir (~1,4 MB).

## B4 düzeltmeleri

1. **Settlement:** Kesinleşmiş satır Edge için nihaidir; ikinci settle hiçbir şeyi değiştirmez. Recover edilmiş satıra geç gelen settle ücreti düşüremez, slotu yeniden açamaz. Bilinmeyen kullanım yalnız sahip-tek `ai_usage_reconcile` ile **bir kez** düzeltilir; ücret değiştirilir, eklenmez. Rezervasyonu aşan gerçek bedel kontrolü kapatır.
2. **Önceki hata kanıtlandı:** eski migration ile recover sonrası settle ücreti 20000'den 700'e düşürebiliyordu (`tests/ai-ledger-pglite.test.mjs` son test).
3. **Edge:** `../../../../lib/practice-evidence.mjs` ve `../../ai-staging-target.json` importları fonksiyon klasörüne senkronlanan kopyalara taşındı; kopyaların güncelliği ve import grafiği test edilir.
4. **Deno tip denetimi** gerçek bir hata buldu (`createAIHttpHandler` seçenek tipi) ve düzeltildi. CI bu hatada kırılacaktı.
5. **Meta adaptör:** model kimliği yalnız `META_MODEL_ID`'den; yanıt biçimi `META_RESPONSE_FORMAT` (`json_schema` varsayılan, `json_object` izinli, diğerleri config'i kapatır). Yanıttaki `model` farklıysa (alias) reddedilir, retry yok.
6. **İstemci sınırı:** `lib/ai-client.mjs` yalnız sabitlenmiş staging projesinin `/functions/v1/ai-gateway` adresini ya da loopback mock'u kabul eder; production ref reddedilir. Kullanıcı jetonu yalnız jetonu veren Supabase projesinin gateway'ine gider (production derlemesi staging'e jeton göndermez). Yanıt, tarayıcıda aynı kanıttan yeniden üretilen özetle karşılaştırılır; kanıta bağlanmayan gözlem gösterilmez.
7. **Anahtar sızıntısı:** tarayıcı kodu sunucu modüllerini import edemez; Pages çıktısında gizli değişken adı yoktur (test).

## Test sonuçları (bu dal, yerel)

| Paket | Sonuç |
| --- | --- |
| `npm test` (build + uygulama) | 101/101 |
| `test:ai` / `:http` / `:learning` / `:b3` | 20 / 16 / 8 / 5 |
| `test:ai:b4` (yeni) | 19/19 |
| `test:features` (yeni) | 16/16 |
| `test:pages` | 4/4 |
| `test:edge:deno` | check geçti, 1/1 |
| `typecheck`, `lint` | geçti; lint uyarıları yalnız `output/` prototiplerinden |
| Yerel tarayıcı akışı | ana sayfa → oturum → sonuç + AI paneli → devam bandı; MusicXML örneği OSMD ile çizildi; mikrofon kurulum ekranı |

Gerçek Supabase Auth/JWT, PostgREST üzerinden RPC, eşzamanlı iki süreç yarışı (CI Python betiği) ve gerçek Meta yanıtı **test edilmedi**.

## Onay gerektiren staging adımları (sırayla)

1. **Pin dosyası:** `supabase/ai-staging-target.json` içinde `productionProjectRef` hâlâ `null`, origin dizileri boş. Bu haliyle canlı config kapalı kalır (testle doğrulandı). Gerekli: production ref (yalnız yasak-pin olarak), staging frontend'in tam HTTPS origin'i, production origin'leri. Sonra `npm run sync:edge`.
2. **Staging frontend:** Canlı AI yalnız uygulamanın kendisi staging Supabase'e bağlıyken çalışır (`VITE_SUPABASE_URL` staging, `VITE_AI_GATEWAY_URL=https://coftskrofgcfzsuqdtpn.supabase.co/functions/v1/ai-gateway`). Bunun için production'dan ayrı bir önizleme yayını gerekir.
3. **Migration (staging):** `202610300001_ai_usage_ledger.sql` ve `202611020001_ai_usage_settlement_reconcile.sql`, yalnız bu ikisi; `control.enabled=false` ile.
4. **CI dispatch:** `ai-staging.yml` (testler, PostgreSQL, Deno, `AI_BACKEND_MODE=disabled` ile deploy).
5. **Model doğrulama:** `GET https://api.meta.ai/v1/models` (yalnız ID kaydı), fiyat, bağlam/tokenizer sınırı, `json_schema` desteği. Destek yoksa `META_RESPONSE_FORMAT=json_object`.
6. **Tek ücretli smoke:** bir sentetik istek, en fazla $0.02 rezervasyon, retry yok; ardından kapatma.

## Demo senaryosu (yaklaşık 2,5 dakika)

1. Ana sayfa: "NOTA [porte] NOTA" başlığında ısınma notasına bas (kaydedilmez).
2. "Nota çalışmaya başla": tek tıkla 9 notalık tur. Birkaç notayı bilerek yanlış cevapla.
3. Sonuç: doğruluk ve süre ölçümleri; AI Öğretmen paneli kaynağını açıkça yazar (bu derlemede "AI kullanılmadı · ölçümden kurallarla"). "Önerilen tekrarı başlat" ile zayıf notalara tek tıkla geç.
4. Ana sayfaya dön: "Kaldığın yerden devam et" bandı son turu ölçülen değerlerle gösterir; hedef çubukları güncellenir.
5. "Eser çalış → MusicXML aç → Örnek eseri aç": partisyon çizilir, ölçü 1–8 seçilir, konum göstergesiyle notalar sorulur; sonuçta hatalı ölçüler.
6. "Enstrümanla çalış → Mikrofonla çal": gitarla tek nota; oktav farkı açıklanır; ölçülmeyenler listelenir.
7. (Yalnız staging onayı ve canlı doğrulama sonrası) aynı sonuç ekranında "AI Öğretmen'e yorumlat": rozet "Canlı · Meta · <model>" olur; her gözlem dayandığı ölçümle gösterilir.

Video çekiminde canlı Meta kısmı gerçekten yapılmadıysa gösterilmemeli ya da "planlanan" olarak anlatılmalı.

## Bilinen sınırlar

- MusicXML: `.mxl` (sıkıştırılmış), akor ve çok sesli ölçüler (atlanır, gerekçesiyle), C anahtarları, çift diyez/bemol yok; süsleme notaları sorulmaz. Ritim ve tempo ölçülmez. OMR (PDF/fotoğraf) yok; `lib/musicxml.mjs` girişi, ileride OMR → kullanıcı doğrulaması → MusicXML zinciri için aynı noktadır.
- Mikrofon: tek ses; perde dışında hiçbir şey ölçülmez; gürültülü ortamda belirsiz sayılır. Gerçek enstrümanla elle test edilmedi (headless ortamda mikrofon yok).
- AI isteği: modül geçmişinin son 45 gününden, model girdisi sınırına (12.000 karakter özet) sığacak kadar kayıt. Kişisel yorum için aynı notada en az 3 yardımsız cevap gerekir; yoksa model çağrılmaz.
- Hedefler cihazda tutulur; hesaplar arası senkron yok (yeni tablo açılmadı).
- Teslim gereksinimleri (video, açıklama, repo görünürlüğü) resmî kaynaktan **doğrulanamadı**; arama yalnız ikincil kaynak buldu. DevPost yarışma sayfası kontrol edilmeli.
- Dev sunucusu derin yolları sunmaz (`/eser-okuma/musicxml/` 404); Pages derlemesi bu sayfaları statik üretir.
