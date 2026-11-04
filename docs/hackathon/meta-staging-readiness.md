# B4 Meta staging hazırlığı — AKTİVASYON YAPILMADI

30 Ekim 2026. Dal: hackathon/notanota-ai. Hedef: kullanıcının bildirdiği
4 Kasım 2026 21.00 ET tesliminden önce güvenli, gerçek Meta öğrenme geri bildirimi.
Bu belge işlem izni değildir. SQL/secret/deploy/ücretli çağrı ve commit/push ayrı
onay bekler. B4'te yalnız dokümantasyon değiştirildi.

## Durum ve incelenen bağlantı

`supabase/ai-staging-target.json`: iki ref null, iki origin dizisi boş. Projenin
bulut hesabında varlığı kontrol edilmedi; dosyalardan oluşturulmuş olduğu çıkarılamaz.
Production'a fallback YOK. Hedef doğrulayıcı mevcut dosyayla başarısız olmalıdır.

Edge index → stagingConfig → createStagingGateway → Meta registry/adapter +
PostgresUsageStore → public RPC. Auth ayrı anon-client ile getUser(jwt) doğrular;
service-role client kullanıcı Authorization header'ı almaz. CORS tam origin eşleşmesi.
Local mock URL/origin koşulları korunuyor. Meta tek canlı sağlayıcı; model ID yoksa
canlı config yok. Response schema-v1 ve observations.evidenceRefs doğrulaması korunur.
Model ham cevapları değil sunucuda türetilmiş aggregate ölçümleri alır. Bunlar yine
istemci bildirimidir; gerçek çalma ölçümü veya hileye dayanıklı kanıt değildir.

## SQL/RPC/RLS incelemesi

Migration uygulanmadı. Private tablolar, RLS, boş search_path, açık EXECUTE revoke,
service_role-only reserve/settle ve owner-only recover var. Tek control kilidi altında
count/budget/duplicate denetimi küçük staging için makul; gerçek Postgres testi şart.
Günlük ve lifetime ücretlere bekleyen maksimum rezervasyon da dahildir. Bilinmeyen
usage slotu ve bedeli korunur. Account deletion replay'i temizler, global bedel kalır.

**İncelemede bulunan, aktivasyon öncesi çözülmesi veya açıkça kabul edilmesi gerekenler:**

1. `ai_usage_settle` settled_at doluysa koşulsuz döner. Bu yüzden daha önce unknown
   olarak settle edilmiş kaydı ikinci settle ile bilinen kullanıma reconcile etmek
   mümkün değil. B3 belgesindeki genel geç reconciliation ifadesi bu durum için
   fazla geniştir. Şimdilik muhafazakâr bedel kalır; kontrollü admin reconciliation
   tasarımı/testi gerekir. Aynı RPC'yi tekrar çağırmak düzeltmez.
2. Replay TTL temizliği lazy; kesin 24 saat temizlik için zamanlanmış görev ve
   billing retention kararı yok. Silme sonrası global ücretin kalması kasıtlıdır.
3. Tek global lock ve tüm ledger SUM sorguları ölçek iddiası taşımaz; küçük staging
   için yarış/lock-timeout testleri yapılmalı. SQL'de global aktif-request sayısı
   yok; global maliyet sınırı var. Per-user eşzamanlılık bunun yerine geçmez.
4. Reserve bedelini yalnız backend belirler; SQL model fiyat kataloğunu doğrulamaz.
   service-role güven sınırıdır. Model ID/fiyat/token attestation yanlışsa kilit
   bunu otomatik saptamaz. İzinli backend dışına RPC anahtarı çıkarılmamalı.
5. Doğal dilde uydurma ölçüm/yorumları şema tümüyle yakalayamaz. Modelin gerçekten
   desteklenen json_schema formatı, response.model alias davranışı ve usage token
   semantiği hesap/model bazında sentetik testte incelenmeli.

Bu bulgular B4'te migration/runtime değiştirilmeden kayıt altına alındı.

## Edge paketleme ve runtime kapıları

- `../../ai-staging-target.json` function klasörünün dışında; JSON import attributes
  Deno/remote bundler'da doğrulanmalı.
- validation ve evidence-summary, `../../../../lib/practice-evidence.mjs` dosyasını
  repo kökünden import eder. Transitive modüller de bundle'a girmeli. Node testinin
  geçmesi remote --use-api paketlemenin geçtiği anlamına gelmez.
- npm:@supabase/supabase-js@2.110.7, strict TS inference, Deno 2.5.6 ve Edge runtime
  uyumu gerçek CI'da kontrol edilmedi. Deno check checkJs:false olduğundan JS'in tüm
  davranışını tip denetimi kanıtlamaz.
- Varsayılan gateway JWT doğrulaması ile projenin JWT imza tipi uyumu kontrol
  edilmeli; getUser yerine decoded claims kullanma veya JWT kontrolünü gelişigüzel
  kapatma. Platform JWT uyumsuzluğu çıkarsa ayrıca incelenmiş Auth kararı gerekir.
- DENO_DEPLOYMENT_ID prefix ve built-in Supabase env değerleri hedef runtime'da
  doğrulanmalı. Uyuşmazlık fail-closed olur; korumayı kaldırarak çözülmemeli.
- HTTP abort provider'a iletilir; RPC fetch timeout'u ayrıca tanımlı değil. Deadline
  bittiğinde pending RPC/settlement devam edebilir; isolate kapanması ve crash
  recovery davranışı gerçek ortamda sınanmalı.

## Workflow güven sınırı

Manuel dispatch, exact branch, ai-staging environment, ref/pin/input eşleşmesi,
explicit --project-ref ve yalnız ai-gateway deploy var. DB migration/Pages deploy yok.
`--use-api` Docker olmadan uzak bundling sağlar [S1]; bu paketleme testi yapılmış
demek değildir. Workflow deploy öncesi AI_BACKEND_MODE=disabled secret'ını değiştirir;
dolayısıyla dispatch onayı bu kapatma işlemini de kapsamalı.

**Koşullu güvence:** Doğru pin ve staging-only token ile production hedeflenmez.
YAML yanlış pinlenen projeyi kendiliğinden tanıyamaz; token production'a da yetkiliyse
kesin fiziksel izolasyon yoktur. Ayrı staging organizasyonu/least privilege token,
required reviewer, self-review engeli ve environment branch kısıtları kullanıcı
tarafından kurulup kontrol edilmeli. Mevcut production workflow değiştirilmedi.
main push hâlâ Pages deploy tetikleyebilir; default-branch workflow keşfi için
izinsiz main push yapılmamalı. Workflow_dispatch'in default-branch gereksinimini
repo yöneticisiyle incele [G1].

CI hâlâ hiç çalıştırılmadı. Postgres service image ve Deno install shell dosyası
digest/checksum ile pinli değil; CLI için exact sürüm var ama bütün supply chain'in
immutable olduğu iddia edilmez. İlk dispatch öncesi bu risk gözden geçirilmeli.

## Kullanıcıdan gerekli bilgiler (SECRET DEĞİL)

- Ayrı staging projesi oluşturuldu mu? Proje ref'i ve tam HTTPS Supabase URL'si.
- Production ref'i yalnız deny-pin olarak, production/staging origin listeleri.
- Staging frontend için tam HTTPS origin (henüz panel bağlantısı yok).
- GitHub repo/environment yöneticisi; required reviewer ve branch kuralları durumu.
- İncelenmiş exact Supabase CLI 2.x.y sürümü.
- Hesapta GET model-list ile doğrulanmış model ID, doğrulama tarihi, schema desteği,
  context/tokenizer sınırı ve uncached input/output/reasoning üst fiyatları.

API key, service key, access token veya kullanıcı JWT'si sohbete gönderilmez.
Secret değerleri okunmadı. Proje kimlikleri bile kullanıcı onayı olmadan pinlenmez.

## Aşamalı onay ve eylemler

1. **Proje/pin incelemesi:** staging yoksa ayrı oluştur; production kullanma.
   Non-secret pinleri gözden geçir. Commit/push için ayrıca izin ver.
2. **CI/deployment onayı:** ai-staging environment vars:
   AI_STAGING_PROJECT_REF, AI_PRODUCTION_PROJECT_REF, AI_SUPABASE_CLI_VERSION.
   Secret: AI_STAGING_SUPABASE_ACCESS_TOKEN (yalnız staging erişimli).
   PostgreSQL davranış/race ve Deno testleri yeşil olmadan dağıtım yok.
3. **Staging SQL uygulama onayı:** yalnız B3 migration; db push ile tüm migration'lar
   veya auth stand-in dosyaları bulut projesine uygulanmaz. İlk control.enabled=false.
4. **Ücretsiz/sağlayıcısız kontroller:** staging test hesabı; gerçek JWT başarı,
   expired/forged/anonymous ret; CORS; RPC grant/RLS; idempotency ve concurrency.
   Disabled config geçerli JWT ile 503 verir; gerçek başarılı getUser/gateway yolunu
   sınamak için ayrıca sağlayıcısız harness veya test ortamı gerekir. Disabled 503
   tek başına getUser doğrulamasını kanıtlamaz.
5. **Secret/model-list onayı:** API key yalnız Edge Secrets'a kullanıcı tarafından
   sağlanır. Onaylı geçici server-only kontrol, `GET https://api.meta.ai/v1/models`
   + Bearer header ile katalog erişimini doğrular [M1]. POST completion YAPMA.
   Full response/header/secret loglama; yalnız ID ve kontrol sonucu kaydet.
   Mevcut ai-gateway model-list endpoint'i sağlamaz; bunu varmış gibi kullanma.
   Geçici admin function uygulanacak/deploy edilecekse ayrıca izin ve kaldırma planı
   gerekir. Katalog tek başına schema/pricing garantisi değil.
6. **Konfigürasyon:** B3 belgesindeki META_* ve AI_* değişkenlerini incele.
   Model ID varsayılanı yok; META_TOKEN_BOUND_VERIFIED yalnız gerçekten kontrol
   sonrası true. 12.000 char / 52.096 input token varsayımsal üst sınırını ve
   800 max_completion_tokens dahil reasoning maliyetini doğrula. $0.02'ye sığmıyorsa
   live config kapalı kalır; limitleri sessiz artırma.
7. **Ayrı ücretli smoke onayı:** örneğin yalnız 1 benzersiz sentetik istek, en fazla
   $0.02 rezervasyon, retry yok; mevcut toplam $10 bütçe smoke bütçesi sanılmasın.
   İstenirse staging DB'de kullanıcı/global/toplam bütçeyi bu tek rezervasyona indir.
   Proje pinini/DB enabled değerini ve <=24h Edge approval'ı ayrı onayla etkinleştir.
8. **Kontrol ve kapatma:** live Meta provenance, local schema/evidenceRefs, usage ve
   ledger doğrula. Aynı key+aynı body replay yeni inference üretmemeli. Farklı key
   ile otomatik retry yapma. Eksik usage/hata: bedel korunur, slot belirsiz kalır.
   Ardından mode disabled ve DB enabled=false; recover için >=120s lease ve worker
   cancellation onayı. Veritabanı/secret kapatma da yetkili operasyon sayılır.

## İlk isteğin sentetik gövdesi — ağ isteği değildir

Aşağıdaki JavaScript yalnız body oluşturur. Çalıştırmak HTTP isteği yapmaz.
İnsan/gerçek öğrenci bilgisi yok; oturum schema-v1 ve deterministic eligibility ile
uyumludur. Dört yardımsız aynı bağlam: 1 doğru/3 yanlış. Zamanlar çağrı öncesi üretilir.

```js
const now = Date.now();
const syntheticBody = {
  schemaVersion: '1', task: 'practice-feedback', locale: 'tr',
  scope: { module: 'reading', sessionId: 'synthetic-b4' },
  evidence: { records: Array.from({ length: 4 }, (_, i) => ({
    id: `synthetic-b4-${i}`, module: 'reading', task: 'staff-name',
    item: 'treble:f4', session: 'synthetic-b4', clef: 'treble',
    midi: 65, position: 1, accidental: 0,
    correct: i === 0, firstAttempt: true, assisted: false, timedOut: false,
    responseMs: 1200 + i * 100, timeLimitMs: null,
    at: new Date(now - (4 - i) * 60000).toISOString(),
  })) },
};
```

Onaylı ilk çağrı: staging POST /functions/v1/ai-gateway, application/json,
Authorization Bearer **staging test hesabı JWT**, staging publishable apikey,
tek yeni idempotency-key. Anahtar/JWT içeren komut veya body'yi repo/log/video içine
koyma. Gerçek çağrı yapan script B4'te eklenmedi. Replay için gövdeyi/zamanları
yeniden üretme; aynı kaydedilmiş sentetik body'yi kullan.

Başarı: schemaVersion=1, mode=live, provider=meta, exact verified model ID,
refs mevcut ölçümlere bağlı; input/output kullanım ve mikro-USD settlement kontrolü.
Mock/deterministic sonuç canlı başarı sayılmaz. Backend smoke sonrası mevcut DEMO
paneli değişmez; ürün deneyimi için ayrı onaylı frontend-backend işi gerekir.

## B4 doğrulama kaydı

Node AI testleri 49/49, typecheck geçti, lint 0 error + mevcut output uyarısı.
Deno/psql PATH'te yok; kurulum/gerçek PostgreSQL/Edge/JWT/Meta testleri yapılmadı.
İki zorunlu roadmap ve iki inceleme belgesi için encoding/code-fence/dilim listesi
kontrolü geçti. Belgede verilen sentetik gövde ağ kullanmadan mevcut validateRequest
ve buildEvidenceSummary ile çalıştırıldı: 4 kayıt, eligible=true, %25 doğruluk.
Kaynak sayfaları tarayıcı aracıyla incelendi; repo klonlama/paket indirme yapılmadı.
Üretim, mevcut CSS, runtime ve workflow B4'te değiştirilmedi.

## Birincil referanslar

- [M1] https://dev.meta.ai/docs/api-reference/models/list-models
- [M2] https://dev.meta.ai/docs/api-reference/chat-completions/schemas
- [S1] https://supabase.com/docs/guides/functions/deploy
- [S2] https://supabase.com/docs/guides/functions/secrets
- [S3] https://supabase.com/docs/guides/functions/auth
- [G1] https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch