"use client";

import "./landing.css";

type Locale = "tr" | "en";

// No price, quota or launch date has been decided, so none is shown or implied.
const TEXT = {
  tr: {
    title: "Temel çalışma ücretsiz. NotaNota AI ayrı bir seçenek olacak.",
    lead: "Nota okuma, ritim, eser ve enstrüman çalışmaları ücretsiz kalıyor. NotaNota AI, çalışmanda ölçülen sonuçlara bakarak açıklama yapacak ve sıradaki alıştırmayı önerecek.",
    free: "Ücretsiz",
    freePrice: "0 ₺",
    freeNote: "Hesap açmadan başlayabilirsin.",
    freeItems: ["Nota okuma: sol ve fa anahtarı, dört aralık", "Ritim ve işitme atölyeleri", "Eser çalışma ve nota dosyası açma", "Piyano, gitar ve keman eşleştirmesi", "Hedefler, ilerleme ve sıralama"],
    freeCta: "Stüdyoya git",
    ai: "NotaNota AI",
    aiPrice: "Fiyat henüz açıklanmadı",
    aiNote: "Ücret ve kullanım sınırı belirlendiğinde bu sayfada yer alacak.",
    aiItems: ["Ölçülen hatalarına dayanan açıklama", "Takıldığın notaya ya da ölçüye göre alıştırma önerisi", "Ölçülmeyen şey hakkında yorum yapmaz", "Sohbet penceresinden soru sorma"],
    aiCta: "Örnek sohbeti aç",
    aiCtaNote: "Örnek sohbet hazırlanmış yanıtlarla çalışır.",
    faqTitle: "Sık sorulanlar",
    faq: [
      ["Ücretsiz çalışmalar kalkacak mı?", "Hayır. Temel öğrenme akışı ücretsiz kalacak."],
      ["NotaNota AI ne zaman açılacak?", "Tarih henüz belli değil. Açıldığında bu sayfada ve uygulama içinde duyurulacak."],
      ["Ödeme alıyor musunuz?", "Şu an hiçbir ödeme alınmıyor; bu sayfada ödeme adımı yok."],
    ],
  },
  en: {
    title: "Core practice is free. NotaNota AI will be a separate option.",
    lead: "Note reading, rhythm, pieces and instrument practice stay free. NotaNota AI will look at the results measured in your practice, explain them and suggest the next exercise.",
    free: "Free",
    freePrice: "0",
    freeNote: "You can start without an account.",
    freeItems: ["Note reading: treble and bass clef, four ranges", "Rhythm and listening workshops", "Piece practice and opening score files", "Piano, guitar and violin mapping", "Goals, progress and ranking"],
    freeCta: "Go to the studio",
    ai: "NotaNota AI",
    aiPrice: "Price not announced yet",
    aiNote: "The price and usage limits will appear on this page once they are set.",
    aiItems: ["Explanations based on your measured mistakes", "Exercise suggestions for the note or bar you get stuck on", "No comments on anything that was not measured", "Ask questions in the chat window"],
    aiCta: "Open the sample chat",
    aiCtaNote: "The sample chat runs on prepared answers.",
    faqTitle: "Common questions",
    faq: [
      ["Will the free practice go away?", "No. The core learning flow stays free."],
      ["When will NotaNota AI open?", "There is no date yet. It will be announced here and in the app."],
      ["Do you take payments?", "No payment is taken today; there is no checkout on this page."],
    ],
  },
} as const;

export function PricingPage({ locale, onOpenChat, onStudio }: { locale: Locale; onOpenChat: () => void; onStudio: () => void }) {
  const t = TEXT[locale];
  return (
    <div className="lp pricing">
      <section className="pricing-head" aria-labelledby="pricing-title">
        <h1 id="pricing-title">{t.title}</h1>
        <p>{t.lead}</p>
      </section>
      <div className="pricing-plans">
        <article className="plan" aria-labelledby="plan-free">
          <h2 id="plan-free">{t.free}</h2>
          <p className="plan-price">{t.freePrice}</p>
          <p className="plan-note">{t.freeNote}</p>
          <ul>{t.freeItems.map((item) => <li key={item}>{item}</li>)}</ul>
          <button type="button" className="secondary-button" onClick={onStudio}>{t.freeCta}</button>
        </article>
        <article className="plan plan--ai" aria-labelledby="plan-ai">
          <h2 id="plan-ai">{t.ai}</h2>
          <p className="plan-price plan-price--text">{t.aiPrice}</p>
          <p className="plan-note">{t.aiNote}</p>
          <ul>{t.aiItems.map((item) => <li key={item}>{item}</li>)}</ul>
          <button type="button" className="primary-button" onClick={onOpenChat}>{t.aiCta}</button>
          <p className="plan-note">{t.aiCtaNote}</p>
        </article>
      </div>
      <section className="pricing-faq" aria-labelledby="pricing-faq">
        <h2 id="pricing-faq">{t.faqTitle}</h2>
        <dl>{t.faq.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
      </section>
    </div>
  );
}
