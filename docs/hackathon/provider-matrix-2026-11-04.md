# Sağlayıcı matrisi: Meta, Baseten, Claude (2026-11-04)

Bu not yalnızca sağlayıcıların kendi resmi sayfalarından okunan bilgilere dayanır. Her kaynak 2026-11-04 tarihinde okundu. Sayfada bulunamayan her şey **[DOĞRULANMADI]** olarak işaretlendi. Ücretli API çağrısı yapılmadı, anahtar ya da `.env` okunmadı. Repo yalnızca okundu.

---

## 1. Meta Model API

Kaynaklar (hepsi 2026-11-04):
- M1 https://dev.meta.ai/docs/pricing-rate-limits
- M2 https://dev.meta.ai/docs/models
- M3 https://dev.meta.ai/docs/image-understanding
- M4 https://dev.meta.ai/docs/error-handling
- M5 https://dev.meta.ai/docs/api-reference/chat-completions/create-chat-completion
- M6 https://dev.meta.ai/docs/api-reference/chat-completions/schemas
- M7 https://dev.meta.ai/docs (navigasyon listesi)
- M8 https://dev.meta.ai/legal/geographic-use-policy
- M9 https://dev.meta.ai/help

### 1.1 Modeller ve fiyatlar (M1, M2)

| Model id | Mod | Girdi $/M | Önbellekli girdi $/M | Çıktı $/M | RPM | TPM | Bağlam | Görsel girdi |
|---|---|---|---|---|---|---|---|---|
| `muse-spark-1.3` | Standard | 1,25 | 0,15 | 4,25 | 3.000 | 4.000.000 | 1.048.576 | Evet (metin, görsel, video, ses, PDF) |
| `muse-spark-1.2` | Standard | 1,25 | 0,15 | 4,25 | 3.000 | 4.000.000 | 1.048.576 | Evet |
| `muse-spark-1.1` | Yalnızca Standard | 1,25 | 0,15 | 4,25 | 3.000 | 4.000.000 | 1.048.576 | Evet |
| `muse-spark-1.3-contributor` | Contributor | 0,10 | 0,002 | 0,20 | 150 | 3.000.000 | 1.048.576 | Evet (`max` reasoning yok) |
| `muse-spark-1.2-contributor` | Contributor | 0,10 | 0,002 | 0,20 | 150 | 3.000.000 | 1.048.576 | Evet |
| `muse-wonder-1.0` (önizleme) | Standard | 4,00 | 0,20 | 20,00 | 3.000 | 4.000.000 | 1.048.576 | Evet |
| `muse-image-1.0` | — | 0,01 $ / üretilen görsel | | | 150 | — | — | Görsel üretir |
| `sam-3.1` | — | 2,50 $ / 1.000 görsel | | | 3.000 | — | — | Segmentasyon |
| `muse-voice-transcribe-1.0` | — | 0,18 $ / ses saati | | | — | — | — | Ses → metin |

- Rate limit ekip başına uygulanır, anahtar başına değil. Uzun bağlam primi yok. Faturalama kullandıkça öde (M1).
- Contributor modunda Meta istemleri, dosyaları ve yanıtları eğitim için kullanabilir (M1). Bu yüzden kullanıcı görselleri ve öğrenci verisi için **önerilmez**.
- Web arama: 2,50 $ / 1.000 sorgu, token ücretine ek (M1). Background yanıtlar: ekip başına dakikada 600 yeni gönderim (M1).
- Muse Spark 1.3'te ses anlama tam desteklenmiyor (M2). Bizim için önemsiz.

### 1.2 Sınırlar

- **Maksimum çıktı tokenı:** M2 ve M6'da hiçbir model için yazmıyor. `max_completion_tokens` görünen çıktıyla reasoning tokenlarını birlikte sınırlar (M6). **[DOĞRULANMADI: üst sınır]**
- `reasoning_effort`: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` (M6). `response_format`: `text`, `json_schema` (önerilen), `json_object` (M6).
- Usage alanları: `prompt_tokens`, `completion_tokens`, `total_tokens`, `completion_tokens_details.reasoning_tokens`, `prompt_tokens_details.cached_tokens` (M6).
- **Görsel girdi (M3, M6):** Chat Completions'ta `{"type":"image_url","image_url":{"url": <https URL ya da base64 data URL>, "detail":"auto|low|high"}}`, yalnızca user mesajında. JPEG, PNG, GIF, WebP, ICO. Satır içi görsel en fazla 50 MB, Files API ile 1 GiB, istek başına en fazla 50 görsel. Bozuk görsel HTTP 400 döner. `store=true` ile 8 MB üstündeki görseller düşürülür.
- **Görsel token maliyeti (M3):** Çözünürlüğe göre ölçeklenir. Yaklaşık 1280 px'lik bir görsel 1.300–1.500 token, sabit ek yük yaklaşık 110 token. Kesin sayı için `POST /v1/responses/input_tokens` kullanılır. **[DOĞRULANMADI: görsel başına üst token sınırı ve bu sayma uç noktasının ücretli olup olmadığı]**
- **İstek gövdesi:** Senkron Chat Completions için bayt sınırı yazmıyor. Background istekleri 1 MiB ile sınırlı ve aşınca 413 döner (M4). **[DOĞRULANMADI: senkron gövde sınırı]**
- **Hata kodları (M4):** 400, 401, 402 (bakiye), 403, 404, 413, 429, 500, 503, 504. 429, 500 ve 503 tekrar denenebilir, `Retry-After` dikkate alınmalı. 504 olduğu gibi tekrar denenmemeli. 400–413 düzeltilmeden tekrar denenmemeli. Önerilen deneme sayısı 3–5, üstel geri çekilme ve jitter ile.
- **Başarısız isteklerin ücretlendirilip ücretlendirilmediği:** M4'te yazmıyor. **[DOĞRULANMADI]**
- **Coğrafya (M8):** Türkiye kısıtlı bölge listesinde yok, ama sayfa erişimin açık olduğunu da teyit etmiyor. **[DOĞRULANMADI]**

### 1.3 "Bu görsel nota mı / uygunsuz içerik var mı?" sorusu

- `muse-spark-1.3` görsel kabul ediyor ve `json_schema` structured output destekliyor (M2, M6). Teknik olarak `{isMusicScore, inappropriate, confidence, reason}` gibi bir şemayla sınıflandırma istemi çalışır.
- **Meta Model API'de ayrı bir moderasyon ürünü bulunamadı.** M2'de, M7'nin tam navigasyonunda ve M9'da Llama Guard ya da moderasyon uç noktası yok. `/docs/moderation` 404 döndü. Llama Guard'ı bu API üzerinden sunan resmi bir sayfa bulunamadı. Dolayısıyla bu API üzerinden Llama Guard fiyatı **yok / [DOĞRULANMADI]**.
- Meta, bu modelin görsel moderasyondaki doğruluğu hakkında resmi bir iddia yayımlamıyor. Bu kontrol bir "LLM yargısı" olarak ele alınmalı, güvenlik garantisi olarak sunulmamalı.
- **Tahmini çağrı maliyeti (hesap, ölçüm değil):** Görsel 1280 px'e indirilmiş, yaklaşık 1.500 görsel + 500 metin = 2.000 girdi tokenı, `reasoning_effort: minimal` ve `max_completion_tokens: 300`. Bu durumda 2.000 × 1,25 + 300 × 4,25 = 3.775 mikro$, yani **yaklaşık 0,004 $**. Rezervasyon için girdi tavanı 3.000 token alınırsa **0,005 $**.

### 1.4 Repodaki mevcut yapılandırma

- Adaptör `supabase/functions/_shared/ai/providers/meta.mjs`: uç nokta `https://api.meta.ai/v1/chat/completions` koda sabitlenmiş (satır 5, 63–64). `stream:false`, `store:false`, `reasoning_effort:'minimal'`, `json_schema` strict, `max_completion_tokens` en fazla 800, zaman aşımı en fazla 20 s (varsayılan 10 s). Yanıt gövdesi 64 KiB ile sınırlı. Yalnızca `practice-feedback` ve `adaptive-exercises` görevleri tanımlı. **Görsel girdi yolu yok.**
- **Model id ve fiyat koda yazılmamış.** `staging-config.mjs` bunları `META_MODEL_ID`, `META_INPUT_USD_PER_MILLION` ve `META_OUTPUT_USD_PER_MILLION` ortam değişkenlerinden alıyor. Doğrulama kaynağı olarak `https://api.meta.ai/v1/models` isteniyor ve doğrulama tarihi 7 günden eski olmamalı. `docs/hackathon/ui-v5-2026-11-03.md` `muse-spark-1.3` ve 1,25 $ / 4,25 $ kaydediyor. Bu değerler M1 ile **birebir uyuşuyor**. Ortamdaki gerçek değerler okunmadı.
- Bütçe sınırı: girdi 8.000 ASCII karakter + 4.096 token marjı, çıktı 800 token. Ayrılan tutar 0,0185 $. Tavan 0,02 $ (`staging-config.mjs` satır 36–40).
- **Görsel için uyarı:** Bugünkü bütçe kanıtı "her bayt en fazla bir token" varsayımına dayanıyor. Base64 görsel bu varsayımı anlamsız kılar: 300 KB'lık bir görsel bu kurala göre 400.000 token sayılır ve config kapanır. Görsel görevi kendi sınırını tanımlamalı: sunucuda yeniden boyutlandırma (örneğin uzun kenar en fazla 1280 px), `detail` sabit, görsel başına muhafazakâr bir token tavanı. Bu tavan önce `input_tokens` ile birkaç gerçek nota sayfasında ölçülmeli.

---

## 2. Baseten

Kaynaklar (hepsi 2026-11-04):
- B1 https://www.baseten.co/pricing/ (tarayıcıda render edilerek okundu)
- B2 https://docs.baseten.co/deployment/resources
- B3 https://docs.baseten.co/inference/model-apis/overview
- B4 https://docs.baseten.co/inference/model-apis/pricing-and-limits.md
- B5 https://docs.baseten.co/inference/async
- B6 https://docs.baseten.co/deployment/autoscaling
- B7 https://docs.baseten.co/deployment/autoscaling/request-lifecycle.md
- B8 https://docs.baseten.co/development/model/custom-server.md

### 2.1 Model APIs kataloğu (B1 fiyat, B3 limit ve özellik)

| Model | Slug | Girdi $/M | Önbellekli $/M | Çıktı $/M | Bağlam | Maks. çıktı | Vision |
|---|---|---|---|---|---|---|---|
| Muse Spark Open | `meta-models/muse-spark-open` | 1,25 | 0,15 | 4,25 | 1048k | 1048k | ✓ (ses de var; structured output **yok**) |
| Nemotron Super 3.5 VL | `nvidia/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B` | 0,20 | 0,04 | 0,50 | 1048k | 1048k | ✓ |
| GLM 5.3 | `zai-org/GLM-5.3` | 1,40 | 0,14 | 4,40 | 1048k | 262k | ✓ |
| GLM 5.3 Fast | `zai-org/GLM-5.3-Fast` | 2,10 | 0,21 | 6,60 | 1048k | 262k | ✓ |
| GLM 5.3 Flash | `zai-org/GLM-5.3-Flash` | 0,15 | 0,03 | 0,50 | 1048k | 262k | ✓ |
| GLM 5.2 / 5.2 Fast | `zai-org/GLM-5.2`, `-Fast` | 1,40 / 2,10 | 0,14 / 0,21 | 4,40 / 6,60 | 1048k | 262k | ✓ |
| DeepSeek V4.1 Flash (+1017, Fast) | `deepseek-ai/DeepSeek-V4.1-Flash…` | 0,30 (Fast 0,60) | 0,007 (0,014) | 1,20 (2,40) | 1048k | 262k (Fast 131k) | ✓ |
| DeepSeek V4 Flash 0731 | `deepseek-ai/DeepSeek-V4-Flash-0731` | 0,13 | 0,028 | 0,26 | 1048k | 384k | – |
| DeepSeek V4 Pro 0813 | `deepseek-ai/DeepSeek-V4-Pro-0813` | 1,32 | 0,132 | 3,96 | 1048k | 262k | – |
| Kimi K3 | `moonshotai/Kimi-K3` | 3,00 | 0,30 | 15,00 | 1048k | 262k | ✓ |
| Nemotron 3 Ultra | `nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B` | 0,60 | 0,12 | 2,40 | 202k | 202k | – |
| GPT OSS 120B | `openai/gpt-oss-120b` | 0,10 | — | 0,50 | 128k | 128k | – |
| Beam | `reflection/Beam-1.0` | 0,40 | 0,04 | 1,20 | 1048k | 131k | – |
| elephant-1 / mammoth-1 (karar modelleri, System One) | — | 0,035 / 0,10 | 0 | 0 | — | — | — |

- Base URL: `https://inference.baseten.co/v1` (OpenAI uyumlu). Anthropic Messages uyumluluğu beta (B3).
- Rate limit (B4): Basic doğrulanmamış hesap 15 RPM / 100k TPM, Basic doğrulanmış 120 / 500k, Pro 120 / 1M.
- Senkron Model API isteklerinde girdi ve çıktı saklanmaz (ZDR, B3).
- **Başarısız ya da zaman aşımına uğrayan isteklerin faturalanması:** B4 bu konuda destek ekibine yönlendiriyor. **[DOĞRULANMADI]**
- Dikkat: Muse Spark Open, Meta'daki `muse-spark-1.3` ile aynı fiyatta ama structured output desteklemiyor (B3). Ana sohbet için Baseten'e geçmenin bir avantajı yok.

### 2.2 Dedicated deployment (B1, B2), dakika başı

| Tür | Örnek | $/dk | ≈ $/saat |
|---|---|---|---|
| CPU | `1x2` / `1x4` / `2x8` / `4x16` / `8x32` / `16x64` | 0,00058 / 0,00086 / 0,00173 / 0,00346 / 0,00691 / 0,01382 | 0,035 / 0,052 / 0,104 / 0,208 / 0,415 / 0,829 |
| T4 16 GiB | `T4x4x16` / `T4x8x32` / `T4x16x64` | 0,01052 / 0,01504 / 0,02408 | 0,63 / 0,90 / 1,44 |
| L4 24 GiB | `L4:4x16` | 0,01414 | 0,85 |
| A10G 24 GiB | `A10Gx4x16` / `A10Gx8x32` | 0,02012 / 0,02424 | 1,21 / 1,45 |
| A100 80 GiB | `A100:12x144` | 0,06667 | 4,00 |
| H100 MIG 40 GiB / H100 / H200 / B200 | | 0,0625 / 0,10833 / 0,125 / 0,16633 | 3,75 / 6,50 / 7,50 / 9,98 |
| RTX-PRO-6000 96 GiB | | 0,06667 | 4,00 |

Çoklu GPU varyantlarının tamamı B2'de listeleniyor.

### 2.3 Async inference, webhook, ölçekleme, zaman aşımı

- **Async (B5):** `POST https://model-{model_id}.api.baseten.co/environments/production/async_predict` hemen bir `request_id` döner. Model APIs ile çalışmaz, yalnızca dedicated deployment'larla. Kuyrukta en fazla 72 saat bekleyebilir. `max_time_in_queue_seconds` varsayılanı 10 dakika, aşılırsa durum `EXPIRED` olur. **Her deneme en fazla 1 saat sürebilir.**
- **İç yeniden deneme (B5):** `inference_retry_config.max_attempts` 1–10 arası, **varsayılan 3**. Bütçe için **1'e çekilmeli**, yoksa bir iş üç kez faturalanabilir.
- **Webhook (B5):** HTTPS POST. Gövde `request_id, model_id, deployment_id, type, time, data, errors` alanlarını taşır. İmza `X-BASETEN-SIGNATURE: v1=…` başlığında, ham gövdenin webhook sırrıyla HMAC-SHA256'sı. Toplam 2 deneme yapılır (biri yeniden deneme), deneme başına 10 s zaman aşımı. **Ikisi de başarısız olursa çıktı kalıcı olarak kaybolur.** Baseten çıktıyı saklamaz. Bu yüzden model çıktıyı kendisi bir depoya yazmalı (örneğin imzalı bir Supabase Storage yükleme URL'sine).
- **Durum ve iptal (B5):** `GET` / `DELETE https://model-{model_id}.api.baseten.co/async_request/{request_id}`. Durumlar `QUEUED`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELED`, `WEBHOOK_FAILED`. Durum bilgisi tamamlandıktan sonra **1 saat** kalır. Yalnızca `QUEUED` durumundaki iş iptal edilebilir.
- **Ölçekleme (B6):** `min_replica` varsayılanı 0 (scale-to-zero), `max_replica` 1, concurrency target 1. **`scale_down_delay` varsayılanı 900 s** (0–3600). Sıfır replikada GPU ücreti yok, ama **cold start süresi dakika başı faturalanır**. Tipik cold start süresi: **[DOĞRULANMADI]** (B6 ayrı bir "Startup times" sayfasına yönlendiriyor, o sayfa okunmadı).
- **Zaman aşımı (B7):** Senkron predict sunucu varsayılanı 1200 s. Replika yokken park bekleme süresi de 1200 s, dolunca 500 döner. Predict süresi aşılırsa 504 döner. Async deneme sınırı 3600 s, sonra `MODEL_PREDICT_TIMEOUT`. Predict timeout'u değiştiren config anahtarı: **[DOĞRULANMADI]**.
- **Özel container (B8):** `config.yaml` içinde `base_image.image` ve `docker_server` (`start_command`, `server_port`, `predict_endpoint`, `readiness_endpoint`, `liveness_endpoint`). 8080 portu ayrılmış, kullanılamaz. Standart build Debian tabanlı imaj ve PATH'te Python 3 ister. Container root olmayan UID 60000 ile çalışır. "no-build" modu destek ekibinden açtırılmalı. Dağıtım `baseten model push` ile yapılır. İmaj boyutu sınırı: **[DOĞRULANMADI]**.

### 2.4 OMR işi için uygunluk (1–12 dk/sayfa)

Repodaki ölçüm (`output/v5-evidence/omr-report.txt`): oemer 0.1.8 CPU'da, 8 thread ile sayfa başına **748–754 s duvar saati**, **5,5 GB tepe bellek**. Sürenin yaklaşık 675 s'si iki U-Net geçişi.

- **Supabase Edge bu işi senkron tutamaz.** Duvar saati sınırı Free planda 150 s, ücretli planda 400 s. İstek boşta bekleme sınırı 150 s. Kaynak: https://supabase.com/docs/guides/functions/limits (2026-11-04). Baseten'in 1200 s senkron sınırı yetse bile gateway bekleyemez. **Doğru yol async_predict + imzalı webhook**, yedek olarak da durum sorgulama.
- **Maliyet tahmini (hesap, ölçüm değil):**
  - `8x32` CPU (32 GiB, oemer için yeterli): 12,5 dk × 0,00691 ≈ **0,086 $/sayfa**.
  - `4x16` CPU: dakika fiyatı yarısı ama 4 vCPU'da süre muhtemelen yaklaşık iki katı, toplam benzer çıkar. **[DOĞRULANMADI: ölçeklenme]**
  - `L4:4x16` / `T4x4x16` GPU: `onnxruntime-gpu` ile U-Net geçişlerinin dakikalardan saniyelere inmesi beklenir. İş 2 dk'ya düşerse yaklaşık **0,02–0,03 $/sayfa** olur. **[DOĞRULANMADI: GPU süresi ölçülmedi. oemer raporu ayrıca `onnxruntime==1.19.2` sabitlemesi gerektiğini söylüyor, GPU sürümüyle uyumu da test edilmeli.]**
  - **Boşta kalma kuyruğu:** varsayılan 900 s scale-down, her yalnız işten sonra 15 dk ek ücret demek (`8x32` için +0,10 $, L4 için +0,21 $). `scale_down_delay` 0–60 s'ye çekilmeli. Cold start dakikaları da faturalanır.
  - 100 $ ile kabaca: CPU `8x32` ve kısa kuyrukla yaklaşık 1.000 sayfa. Varsayılan 900 s kuyrukla yalnız işlerde yaklaşık 500 sayfa.
- **Ledger uyumu:** `ai_private.control.max_request_micro` en fazla 100.000 (0,10 $) olabilir (`202610300001`, satır 13). CPU işi (0,086 $) bu tavana çok yakın. Cold start ve kuyruk istek başına değil, global "altyapı gideri" olarak izlenmeli.
- **Vision denetimi için Baseten gerekmez.** Meta'da kredi var ve `muse-spark-1.3` görsel + `json_schema` destekliyor. Baseten Model APIs'ta en ucuz VLM `Nemotron 3.5 Super VL` (0,20 $ / 0,50 $), bu da bir yedek seçenek.

---

## 3. Claude API

Kaynaklar (hepsi 2026-11-04), `claude-api` skill'i ve resmi dokümanlar:
- C1 https://platform.claude.com/docs/en/about-claude/models/overview.md
- C2 https://platform.claude.com/docs/en/about-claude/pricing.md
- C3 https://platform.claude.com/docs/en/build-with-claude/vision.md

| Model id | Girdi $/M | Çıktı $/M | Önbellek okuma $/M | Bağlam | Maks. çıktı | Vision |
|---|---|---|---|---|---|---|
| `claude-haiku-5-5` (istem ≤100k token) | 0,10 | 0,50 | 0,01 | 1M | 128K | Evet |
| `claude-haiku-5-5` (istem >100k token) | 0,50 | 2,50 | 0,05 | 1M | 128K | Evet |
| `claude-sonnet-5-5` | 2 | 10 | 0,10 | 1M | 128K | Evet |
| `claude-opus-5-5` | 4 | 20 | 0,20 | 1M | 128K | Evet |
| `claude-fable-5-1` | 10 | 50 | 0,25 | 1M | 128K | Evet |

- Batch API %50 indirimli (C1, C2). `inference_geo: "us"` tüm fiyatları 1,1 ile çarpar (C2).
- **Görsel (C3):** JPEG, PNG, GIF, WebP. API'de görsel başına en fazla 10 MB (base64), en fazla 8000×8000 px, istek gövdesi en fazla 128 MB. Maliyet `⌈w/28⌉ × ⌈h/28⌉` görsel token. Claude 4.7 ve sonrası modellerde (5.5 ailesi dahil) uzun kenar en fazla 2.576 px ve **görsel başına en fazla 4.784 token**, aşan görsel küçültülür.
- **Thinking:** Opus 5.5'te kapatılamaz, varsayılan effort `medium`. Sonnet 5.5'te `disabled` 400 döner, kapatmak için `between_tools` gerekir. Haiku 5.5'te `disabled` yalnızca `high` ve altı effort'ta kabul edilir (skill tablosu). Thinking tokenları çıktı olarak faturalanır, bu yüzden `max_tokens` bütçenin sert tavanıdır.
- **Reddetme:** HTTP 200 ile `stop_reason: "refusal"` gelebilir. Bu kesin bir yanıttır ve usage bilgisi taşır.
- SDK varsayılanı `max_retries: 2`. Gateway'de **0 yapılmalı**, yoksa gizli tekrarlar hem maliyeti hem süreyi katlar.
- **Başarısız isteklerin faturalanması ve rate limit katmanları:** bu oturumda resmi sayfadan okunmadı. **[DOĞRULANMADI]**

### Çağrı başına tahmin: tek sayfa görseli + kısa istem

Varsayım: görsel tavanda 4.784 token, metin 600 token, toplam yaklaşık 5.400 girdi. `max_tokens: 1.500` (thinking dahil, sert üst sınır).

| Model | En kötü durum (tavan) | Not |
|---|---|---|
| `claude-haiku-5-5` | 5.400 × 0,10 + 1.500 × 0,50 = **≈ 0,0013 $** | Sınıflandırma ve moderasyon için yeterli olmalı |
| `claude-sonnet-5-5` | 5.400 × 2 + 1.500 × 10 = **≈ 0,026 $** | Yoğun notasyon karşılaştırması için |
| `claude-opus-5-5` | 5.400 × 4 + 1.500 × 20 = **≈ 0,052 $** | Bu iş için gereksiz pahalı |

Görsel 1568 px uzun kenara indirilirse (A4 oranında yaklaşık 2.240 token), maliyet yaklaşık %40 düşer.

**Öneri:**
- Moderasyon ya da "nota mı?" ikinci görüşü için `claude-haiku-5-5`, effort `low`, `max_tokens` 300–500, rezervasyon **0,001 $**.
- Belirsiz bir OMR sonucunda "görsel ile MusicXML özeti tutarlı mı?" sorusu için `claude-sonnet-5-5`, effort `low`, `max_tokens` 1.500, rezervasyon **0,03 $**.
- Haiku'nun nota okumadaki doğruluğu ölçülmedi **[DOĞRULANMADI]**. Önce birkaç örnekle karşılaştırılmalı.

---

## 4. Gateway gereksinimleri ve üç hata sınıfı

### 4.1 Mevcut Meta yolu bugün ne yapıyor? (kod ve migration okuması)

Akış (`gateway.mjs`, `postgres-store.mjs`, migration'lar):
1. Doğrulama ve boyut kontrolü **rezervasyondan önce** yapılır (`gateway.mjs` satır 39–53). Burada hata varsa satır açılmaz, maliyet sıfırdır.
2. `ai_usage_reserve` rezervasyonu açar. Tutar `charged_micro = reserved_micro` olarak yazılır. Dakika, gün, eşzamanlılık, kullanıcı/gün, global/gün ve global toplam tavanları kontrol edilir (`202611030001`). Lease 120 s.
3. Adaptör çağrılır, sonra `settle` ile kapatılır. `ai_usage_settle` (`202611020001`): token ve tutar biliniyorsa `completed` olur, gerçek tutar yazılır ve slot bırakılır. Bilinmiyorsa `uncertain` olur ve **ayrılan tutarın tamamı tahsil edilmiş kalır**. Settle sonuçları kesindir, ikinci settle hiçbir şeyi değiştirmez. Gerçek tutar ayrılanı aşarsa kill switch kapanır.
4. Eski quota-lock hatası şuydu: `uncertain` satır `released_at is null` olarak kalıyordu ve eşzamanlılık sayacı bu satırları saydığı için kullanıcı kilitleniyordu. `202611030001` bunu düzeltti: artık yalnızca `state='reserved'` olan ve lease süresi dolmamış satırlar sayılıyor. Uzlaştırma yalnızca sahip yetkisiyle, istek başına bir kez yapılabiliyor (`ai_usage_reconcile`).

Üç sınıfın bugünkü karşılıkları:

| Sınıf | Bugün nasıl işleniyor | Değerlendirme |
|---|---|---|
| (a) Gönderilmeden reddedildi | Rezervasyon öncesi hatalarda satır yok. Adaptör içindeki `request_too_large` için `billingUsage {0,0}` yazılıyor, satır 0 $ ile `completed` olup bırakılıyor (`meta.mjs` satır 109–113) | **Kısmen.** Adaptördeki diğer gönderim öncesi hatalar (`invalid_model_configuration`, `live_calls_disabled`, `invalid_request` satır 60–75) ve gateway satır 60'taki abort/onay kontrolü `billingUsage` taşımıyor. Bunlar `uncertain` olarak tam tahsil ediliyor, oysa gerçek maliyet sıfır. Slot kilitlenmiyor ama kullanıcının 0,20 $'lık günlük bütçesi her biri için 0,0185 $ eriyor (yaklaşık 10 hatada kilit). |
| (b) Kesin sağlayıcı yanıtı | HTTP 200 dönüp şema ya da doğrulama başarısızsa `usage` okunuyor ve gerçek tutarla settle ediliyor (satır 134–135, 158). HTTP 4xx/5xx ise `billingUsage` yok, `uncertain` olarak tam tahsil ediliyor (satır 126–131) | 200 için doğru. 4xx/5xx için muhafazakâr ama sınıflandırma yanlış. Meta, başarısız isteklerin ücretli olup olmadığını yazmıyor **[DOĞRULANMADI]**. 400/401/402/403/404/413/429 büyük olasılıkla çıkarım çalışmadan dönüyor. |
| (c) Belirsiz zaman aşımı | `provider_timeout` sonucu `uncertain`, tam tahsil, slot serbest, `ai_usage_reconcile` ile sonradan düzeltiliyor | Doğru. |

### 4.2 Önerilen düzeltmeler (Meta için de geçerli)

1. **Sınıfı açıkça taşıyın.** `AIError`'a `billingClass: 'pre_send' | 'definite' | 'uncertain'` ekleyin. `ai_private.requests`'e `failure_class` ve `provider_status` (HTTP kodu) sütunları ekleyin. Settle mantığı tahmin yürütmesin, bu alana göre karar versin.
   - `pre_send`: istek gönderilmeden önce atılan her hata. Tutar 0, `completed`, slot bırakılır. Bunun bir koşulu var: adaptör, `transport()` çağrılmadan önceki her `throw` için bu sınıfı garanti etmeli.
   - `definite`: sağlayıcıdan HTTP yanıtı geldi. Usage varsa gerçek tutar yazılır. Usage yoksa satır şimdilik `uncertain` kalır ama `provider_status` kaydedilir. Böylece sağlayıcının fatura panosuyla toplu uzlaştırma yapılabilir (ör. "tüm 429'lar 0 $").
   - `uncertain`: zaman aşımı, bağlantı koptu, gövde yarıda kesildi. Tam tahsil edilir, sonra uzlaştırılır.
2. **Retry tavanı:** Gateway bugün tek deneme yapıyor, bu iyi. Tekrar denemeyi istemci yeni bir idempotency key ile yapsın. Her deneme kendi rezervasyonunu açar, böylece maliyet hiç gizlenmez. 504 asla tekrar denenmemeli (M4).
3. **Zaman aşımı:** Meta adaptöründe en fazla 20 s (`meta.mjs` satır 67, `usage-policy.mjs` `timeoutMs ≤ 20000`). Supabase'in 150 s boşta bekleme sınırının altında kalıyor.
4. **Loglama:** Bugün `requestId`, sağlayıcı, süre, token ve tutar loglanıyor, HTTP hatası için durum kodu ve ilk 300 karakter alınıyor. Bunlara eklenmeli: `failure_class`, `provider_status`, `provider_request_id`. İçerik ve anahtar yine loglanmamalı.

### 4.3 İkinci sağlayıcı için gerekenler

Ortak kod engelleri (bugün yalnızca Meta'ya izin veriliyor):
- `202610300001` satır 25: `provider text check (provider = 'meta')`. `ai_usage_reserve` sağlayıcıyı `'meta'` olarak sabit yazıyor (`202611030001` satır 46). Yeni migration'da kısıt `('meta','baseten','claude')` olmalı ve `p_provider` parametresi eklenmeli.
- Sağlayıcı başına tavan gerekli: `control` tablosuna sağlayıcı satırları ya da `*_micro_by_provider` alanları. Böylece Baseten krediyi tükettiğinde Meta sohbeti durmaz.
- `gateway.mjs` satır 47'de `model.provider !== 'meta'` canlı çağrıyı engelliyor. `usage-policy.mjs` `providerOrder[0] === 'meta'` istiyor ve yalnızca `meta` ile `baseten`'e izin veriyor (**`claude` yok**, oysa `model-registry.mjs` `claude`'u kabul ediyor). `staging-config.mjs` yalnızca `META_*` değişkenlerini okuyor.
- Lease süresi sabit 120 s. Sağlayıcıya ya da göreve göre ayarlanmalı.

**Baseten OMR (async):**
- (a) Bütçe ya da doğrulama reddi: satır açılmaz ya da 0 $ ile kapanır. `async_predict` 4xx döndürürse iş kuyruğa girmemiştir. Yine de kesin sınıf olarak kaydedilip 0 $ ile settle edilmeli, çünkü Baseten istek başına değil replika dakikası başına ücret alıyor **[DOĞRULANMADI: reddedilen isteğin replika başlatıp başlatmadığı]**.
- Rezervasyon tutarı = (`max_time_in_queue` + iş tavanı) × instance fiyatı. `inference_retry_config.max_attempts = 1` olmalı. Lease = kuyruk tavanı + 1 saatlik deneme sınırı + pay, örneğin 75 dk. Eşzamanlılık bu süre boyunca kilitli kalmalı.
- (b) `SUCCEEDED` ya da `FAILED` webhook'u kesin sonuçtur. Önce HMAC doğrulanır, sonra settle edilir. **Baseten istek başına maliyet bildirmez.** Container kendi başlangıç ve bitiş zamanını çıktıya yazmalı, tutar = süre × dakika fiyatı. Cold start ve scale-down kuyruğu ayrı bir global gider olarak kaydedilmeli.
- (c) Webhook gelmedi, `WEBHOOK_FAILED` ya da `EXPIRED` durumunda iş `uncertain` kalır. Tamamlanmadan sonraki 1 saat içinde `GET /async_request/{id}` ile durum sorgulanmalı, kalıcı uzlaştırma için Baseten fatura panosu kullanılmalı. Çıktı container tarafından depoya yazıldığı için webhook kaybolsa da sonuç kurtarılabilir.
- Webhook alıcısı ayrı bir Edge function olmalı, idempotent çalışmalı (settle zaten kesin). Sırrı ancak ortam değişkeninden okumalı.

**Claude (senkron, ikinci görüş):**
- Çağrıyı resmi SDK yapmalı, `maxRetries: 0` ile. Zaman aşımı 20 s ile Supabase'in 150 s sınırı arasında bir değer olmalı. Thinking açıkken görsel çağrısının 20 s'yi aşıp aşmadığı ölçülmedi **[DOĞRULANMADI]**. `timeoutMs ≤ 20000` kuralı gerekirse yalnızca bu görev için gevşetilmeli.
- Bütçe kanıtı: görsel tokenı 4.784 tavanlı (C3) + metin karakter tavanı + `max_tokens`. Tavan resmi olduğu için Meta'dakinden daha sağlam bir kanıt.
- (a) Gönderim öncesi ret: 0 $. (b) 200 yanıtı (refusal dahil) ya da `usage` içeren hata: gerçek tutar. (c) Zaman aşımı veya 529/5xx sonrası bağlantı kopması: `uncertain`.
- Kullanım kotası ikinci görüşü gerçekten seyrek tutmalı: yalnızca OMR ya da Meta güveni bir eşiğin altında kaldığında, kullanıcı başına günde en fazla 1–2 kez.

---

## 5. Önerilen görev dağılımı

| Görev | Sağlayıcı ve model | Neden |
|---|---|---|
| Öğretmen sohbeti, pratik yorumları, kişisel öneriler, haftalık rapor anlatımı | Meta `muse-spark-1.3` (Standard) | Kod hazır, `json_schema` ve `reasoning_effort: minimal` destekleniyor, fiyat doğrulandı, 150 $ kredi var. Contributor modu eğitim verisi riski nedeniyle hayır. |
| "Nota mı / uygunsuz mu" ön kontrolü (yüklemeden önce) | Meta `muse-spark-1.3` görsel + `json_schema` | Yaklaşık 0,004 $ / görsel. Ayrı moderasyon ürünü yok, sonucu "LLM yargısı" olarak sunun. |
| OMR (sayfa başına 1–12 dk) | Baseten dedicated, özel container (oemer), **async_predict + imzalı webhook**, `min_replica 0`, `scale_down_delay` ≤ 60 s, `max_attempts 1` | Edge en fazla 400 s tutabilir. Async deneme 1 saate kadar sürebilir. Başlangıç `8x32` CPU (yaklaşık 0,086 $/sayfa), GPU (L4/T4) ölçülüp ucuzsa ona geçilir. |
| Belirsiz OMR ya da moderasyon vakasında ikinci görüş | Claude: moderasyon için `claude-haiku-5-5`, OMR tutarlılığı için `claude-sonnet-5-5` | Görsel token tavanı resmi (4.784), maliyet çağrı başına 0,0013–0,026 $ ile sınırlı ve öngörülebilir. Yalnızca eşik altında devreye girer. |

---

## 6. Resmi kaynaktan doğrulanamayanlar

- Meta: model başına maksimum çıktı tokenı. Senkron istek gövdesi bayt sınırı. Görsel başına token tavanı. Başarısız (4xx/5xx/504) isteklerin faturalanıp faturalanmadığı. `input_tokens` sayma uç noktasının ücreti. Türkiye'de erişimin açık olup olmadığı (yalnızca kısıtlı listede olmadığı doğrulandı). Model API üzerinden Llama Guard ya da başka bir moderasyon ürünü (bulunamadı). Görsel moderasyon doğruluğu.
- Baseten: Model APIs'ta başarısız ya da zaman aşımına uğrayan isteklerin faturalanması. Tipik cold start süresi. Predict timeout config anahtarı. İmaj boyutu sınırı. Reddedilen bir async isteğin replika başlatıp başlatmadığı. oemer'in 4 vCPU'daki ve GPU'daki gerçek süresi (repo ölçümü yalnızca yerel 8 thread CPU için var).
- Claude: başarısız isteklerin faturalanması ve rate limit katmanları (bu oturumda okunmadı). Haiku 5.5'in nota okuma doğruluğu. Thinking açıkken görselli çağrının süresi.
- Tüm maliyet tahminleri hesaptır, gerçek çağrıyla ölçülmedi.
