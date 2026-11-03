"use client";
import { useState } from 'react';
import { SITE_PAGES, pageRoute } from '@/lib/site-routes.mjs';
import { CommunityAccountButton } from './community';
import type { LegalPage } from './site-features';

type Locale = 'tr' | 'en';
type Section = { id?: string; title: string; body: string[] };
type Doc = { status: string; sections: Section[] };

const UPDATED = { tr: 'Son güncelleme: 3 Kasım 2026', en: 'Last updated: 3 November 2026' };
const MAIL = 'kvkk@notanota.online';

// Every statement below is taken from what the product does today (see docs/hackathon/legal-inventory).
// Anything not yet decided is said to be missing instead of being filled in.
const DOCS: Record<LegalPage, Record<Locale, Doc>> = {
  privacy: {
    tr: {
      status: 'Bu sayfa ürünün bugünkü davranışını anlatır. Yasal bildirim metni KVKK aydınlatma metnidir.',
      sections: [
        { title: 'Hesap açmadan', body: ['Bütün çalışmalar hesap olmadan kullanılabilir. Cevapların, ilerlemen, ders durumun, hedeflerin, tema ve dil seçimin yalnız bu tarayıcının yerel deposunda tutulur; sunucuya gönderilmez ve cihazlar arasında eşitlenmez.'] },
        { title: 'Hesap açarsan', body: ['E-posta adresin tek kullanımlık giriş bağlantısı ve hesap güvenliği için işlenir. Google ile giriş açık olduğunda Google’ın bildirdiği e-posta adresi kullanılır.', '3–7 karakterli kullanıcı adın, kategori başına en iyi ve haftalık skorların, tamamlanan çalışma günlerin ve tarayıcının bildirdiği saat dilimi saklanır.', 'Sıralamada herkes kullanıcı adını, skorunu, ortalama cevap süreni ve skorun alındığı zamanı görebilir. E-posta adresin ve günlük serin yayımlanmaz.'] },
        { title: 'Mikrofon ve dosyalar', body: ['Mikrofonla çal çalışmasında ses yalnız bu sayfada çözümlenir; kaydedilmez ve hiçbir yere gönderilmez. Mikrofon yalnız sen başlattığında açılır.', 'Açtığın MusicXML dosyası tarayıcıda okunur, sunucuya yüklenmez. PDF ve fotoğraf şu an işlenmez; seçtiğinde dosya hiçbir yere gönderilmez.'] },
        { title: 'NotaNota AI', body: ['Yayındaki sürümde sohbet ve öğretmen bölümleri örnek yanıtlarla çalışır; gerçek bir yapay zekâ modeline bağlantı kapalıdır.', 'Gerçek model yalnız ayrı bir test ortamında, giriş yapmış test hesaplarıyla deneniyor. Orada Meta Model API’ye yalnız toplu ölçümler gider (çalışma bağlamı, doğruluk ve süre ölçümleri, örnek sayısı); e-posta, kullanıcı adı, kullanıcı kimliği ve tek tek cevaplar gönderilmez. İstekler standart modda ve saklama kapalı (store: false) gönderilir; Meta standart modda içeriğin model eğitiminde kullanılmadığını belirtir.', 'Gerçek model herkese açıldığında bu sayfa ve KVKK aydınlatma metni önce güncellenecek.'] },
        { title: 'Çerez ve takip', body: ['Takip, reklam veya analiz çerezi ve dış betik yoktur. Yazı tipleri sitenin kendisinden yüklenir. Giriş oturumu tarayıcının yerel deposunda tutulur.'] },
        { title: 'Ödeme', body: ['Şu an hiçbir ödeme alınmıyor; sitede ödeme adımı yok.'] },
        { title: 'Silme', body: ['Hesabını Hesabım panelinden kendin silebilirsin. Silindiğinde kullanıcı adın, skorların ve çalışma günlerin silinir. Bu cihazdaki kayıtlar hesap silmeyle silinmez; onları Çerezler ve yerel depolama sayfasından silebilirsin.'] },
      ],
    },
    en: {
      status: 'This page describes what the product does today. The formal notice is the KVKK notice.',
      sections: [
        { title: 'Without an account', body: ['All practice works without an account. Your answers, progress, lesson state, goals, theme and language stay only in this browser’s local storage; they are not sent to a server or synced between devices.'] },
        { title: 'With an account', body: ['Your email address is processed for one-time sign-in links and account security. When Google sign-in is enabled, the email address Google reports is used.', 'Your 3–7 character username, best and weekly scores per category, completed practice days and the browser-reported time zone are stored.', 'On the leaderboard anyone can see your username, score, average answer time and when the score was set. Your email and daily streak are never published.'] },
        { title: 'Microphone and files', body: ['In Play to the microphone the sound is analysed only in the page; it is not recorded or sent anywhere. The microphone opens only when you start it.', 'A MusicXML file you open is read in the browser and not uploaded. PDFs and photos are not processed yet; choosing one sends it nowhere.'] },
        { title: 'NotaNota AI', body: ['In the published site the chat and teacher answer with samples; the connection to a real AI model is switched off.', 'The real model is tried only in a separate test environment with signed-in test accounts. There only aggregate measurements go to the Meta Model API (practice context, accuracy and timing measurements, sample size); no email, username, user ID or individual answers. Requests use standard mode with storage off (store: false); Meta states that standard-mode content is not used to train its models.', 'Before the real model opens to everyone, this page and the KVKK notice will be updated first.'] },
        { title: 'Cookies and tracking', body: ['There are no tracking, advertising or analytics cookies and no third-party scripts. Fonts are served by the site itself. The sign-in session is kept in the browser’s local storage.'] },
        { title: 'Payment', body: ['No payment is taken at the moment; the site has no checkout.'] },
        { title: 'Deletion', body: ['You can delete your account yourself from the Account panel. Your username, scores and practice days are deleted with it. Records on this device are not removed by account deletion; clear them on the Cookies and local storage page.'] },
      ],
    },
  },
  kvkk: {
    tr: {
      status: 'Eksik: başvurular için posta veya KEP adresi ve yurt dışına aktarımın dayanağı henüz eklenmedi. Bu metin hukuki inceleme bekliyor.',
      sections: [
        { title: 'Veri sorumlusu', body: [`Alper Ferit Koç, ${MAIL}`] },
        { title: 'İşlenen veriler ve amaçlar', body: ['E-posta adresi: şifresiz giriş ve hesap güvenliği. Kullanıcı adı, en iyi ve haftalık skorlar, ortalama cevap süresi ve skor zamanı: sıralama. Tamamlanan çalışma günleri ve saat dilimi: kişisel günlük seri. Hesap silindiğinde e-posta adresinin anahtarlı özeti (geri çevrilemez): silme işleminin kaydı.', 'Hizmet reklam veya pazarlama profili oluşturmaz; e-posta adresleri satılmaz ve pazarlama için paylaşılmaz.'] },
        { title: 'Toplama yöntemi ve hukuki sebep', body: ['Veriler hesap oluşturma ve çalışma oturumları sırasında elektronik olarak toplanır. Hesap, sıralama ve günlük seri işlevleri sözleşmenin kurulması ve ifası için; hesap güvenliği ve silme kayıtları meşru menfaat kapsamında işlenir.'] },
        { title: 'Aktarım', body: ['Kimlik doğrulama ve veritabanı hizmeti Supabase, e-posta teslimi Resend üzerinden yürütülür. Bu sağlayıcılar verileri yurt dışında işleyebilir. Yayındaki sürümde yapay zekâ sağlayıcısına veri aktarılmaz.'] },
        { title: 'Saklama', body: ['Hesap, kullanıcı adı, skorlar ve çalışma günleri hesap silinene kadar saklanır ve hesapla birlikte silinir. Silme kaydı (e-postanın anahtarlı özeti, yöntem ve tarih) silme tarihinden itibaren 3 yıl tutulur. Tek kullanımlık giriş bağlantıları kısa sürelidir.'] },
        { title: 'Haklar', body: ['KVKK madde 11 kapsamında verilerinin işlenip işlenmediğini öğrenme, bilgi isteme, amacını öğrenme, aktarıldığı kişileri bilme, düzeltme, silme, bu işlemlerin aktarılanlara bildirilmesini isteme, otomatik analiz sonucuna itiraz ve zararın giderilmesini isteme hakların vardır.'] },
        { id: 'basvuru', title: 'Başvuru ve hesap silme', body: ['Hesabını ve ilişkili kayıtlarını Hesabım panelinden hemen silebilirsin; giriş yapmamışsan panel önce giriş ister.', `Diğer talepler için hesabında kayıtlı e-posta adresinden ${MAIL} adresine yaz. Başvurular talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde sonuçlandırılır.`] },
      ],
    },
    en: {
      status: 'Missing: a postal or KEP address for requests and the legal basis for transfers abroad have not been added yet. This text is awaiting legal review.',
      sections: [
        { title: 'Data controller', body: [`Alper Ferit Koç, ${MAIL}`] },
        { title: 'Data and purposes', body: ['Email address: passwordless sign-in and account security. Username, best and weekly scores, average answer time and score time: the leaderboard. Completed practice days and time zone: your private daily streak. When an account is deleted, a keyed one-way hash of the email: a record of the deletion.', 'The service builds no advertising or marketing profiles; email addresses are never sold or shared for marketing.'] },
        { title: 'Collection and legal basis', body: ['Data is collected electronically when you create an account and practise. Account, leaderboard and streak features are processed to provide the service; account-security and deletion records under legitimate interest.'] },
        { title: 'Transfers', body: ['Authentication and the database run on Supabase, email delivery on Resend. These providers may process data outside Türkiye. The published site sends no data to an AI provider.'] },
        { title: 'Retention', body: ['The account, username, scores and practice days are kept until the account is deleted and are deleted with it. The deletion record (keyed hash of the email, method and date) is kept for 3 years from deletion. One-time sign-in links are short-lived.'] },
        { title: 'Rights', body: ['Under Article 11 of KVKK you may learn whether your data is processed, request information, learn the purpose, know the recipients, ask for correction or deletion and for recipients to be notified, object to a result of automated analysis and claim compensation.'] },
        { id: 'basvuru', title: 'Requests and account deletion', body: ['You can delete your account and related records at once from the Account panel; if you are not signed in, the panel asks you to sign in first.', `For other requests write to ${MAIL} from the email address registered to your account. Requests are answered as soon as possible and within 30 days.`] },
      ],
    },
  },
  terms: {
    tr: {
      status: 'Taslak, yürürlükte değil. Henüz belirlenmedi: sorumluluk sınırları, uygulanacak hukuk ve yetkili mahkeme, hesabın askıya alınma kuralları.',
      sections: [
        { title: 'Hizmet', body: ['NotaNota nota okuma, ritim, işitme ve enstrüman çalışmaları sunan bir web uygulamasıdır. Temel çalışma ücretsizdir ve hesap gerektirmez. Şu an hiçbir ödeme alınmıyor.'] },
        { title: 'Hesap ve sıralama', body: ['Sıralamada kullanıcı adın herkese görünür. Giriş bağlantılarını ve hesabını başkasıyla paylaşma.'] },
        { title: 'Sonuçlar', body: ['Sonuçlar ekrandaki cevaplara ve dokunuşlara dayanır; bir müzik yeteneği puanı veya ustalık belgesi değildir.'] },
        { title: 'NotaNota AI', body: ['Yayındaki sürümde örnek yanıtlar gösterilir. Gerçek model test aşamasındadır; yanıtları yanlış olabilir ve öğretmenin yerini tutmaz.'] },
        { title: 'Kendi dosyaların', body: ['Açtığın dosyalar tarayıcında kalır; onları kullanma hakkının sende olması gerekir.'] },
      ],
    },
    en: {
      status: 'Draft, not in force. Not decided yet: limits of liability, governing law and jurisdiction, rules for suspending an account.',
      sections: [
        { title: 'The service', body: ['NotaNota is a web app for note reading, rhythm, listening and instrument practice. Core practice is free and needs no account. No payment is taken at the moment.'] },
        { title: 'Account and leaderboard', body: ['Your username is public on the leaderboard. Do not share sign-in links or your account.'] },
        { title: 'Results', body: ['Results come from on-screen answers and taps; they are not a musical-ability score or a certificate of mastery.'] },
        { title: 'NotaNota AI', body: ['The published site shows sample answers. The real model is in testing; its answers can be wrong and it does not replace a teacher.'] },
        { title: 'Your files', body: ['Files you open stay in your browser; you need the right to use them.'] },
      ],
    },
  },
  cookies: {
    tr: {
      status: 'Takip, reklam veya analiz çerezi kullanılmadığı için çerez onayı istenmez. Aşağıdakilerin hepsi uygulamanın çalışması için gereklidir.',
      sections: [
        { title: 'Tarayıcında tutulanlar', body: ['Tema ve renk teması, dil, sesli geri bildirim tercihi.', 'Çalışma kayıtları: cevap kanıtları (en fazla 800), son 100 oturum, dersler ve tekrar takvimi, hedefler, okuma ayarı, eser çalışma ilerlemesi.', 'Hesap açtıysan giriş oturumu ve kaydedilmeyi bekleyen bir skor (24 saat).'] },
        { title: 'Çerez', body: ['NotaNota çerez yazmaz. Yukarıdakiler tarayıcının yerel deposunda (localStorage) tutulur.'] },
        { title: 'Silme', body: ['Aşağıdaki düğme bu cihazdaki NotaNota çalışma kayıtlarını ve tercihlerini siler. Giriş oturumun kalır; çıkmak için Hesabım panelini kullan. Tarayıcı ayarlarından site verilerini temizlemek de hepsini siler.'] },
      ],
    },
    en: {
      status: 'There are no tracking, advertising or analytics cookies, so no cookie consent is asked. Everything below is needed for the app to work.',
      sections: [
        { title: 'What your browser keeps', body: ['Theme and colour theme, language, the answer-sound preference.', 'Practice records: answer evidence (up to 800), the last 100 sessions, lessons and the review schedule, goals, the reading setup, score-reading progress.', 'If you have an account, the sign-in session and a score waiting to be saved (24 hours).'] },
        { title: 'Cookies', body: ['NotaNota sets no cookies. All of the above lives in the browser’s local storage.'] },
        { title: 'Clearing', body: ['The button below deletes NotaNota practice records and preferences on this device. Your sign-in session stays; use the Account panel to sign out. Clearing site data in your browser settings removes everything.'] },
      ],
    },
  },
  copyright: {
    tr: {
      status: 'Eksik: telif bildirimleri için ayrı bir adres yok; şimdilik iletişim adresi kullanılıyor.',
      sections: [
        { title: 'Örnek eserler', body: ['NotaNota AI sayfasındaki Ode to Joy (SATB) partisyonu Mutopia Project’ten alınmıştır (eser no. 528). Eser kamu malıdır (Public Domain); dizgiyi Peter Chubb yapmıştır.', 'Çalışmalardaki porte satırları uygulama tarafından üretilir.'] },
        { title: 'Sesler', body: ['Doğru cevapta çalan piyano sesi Alexander Holm’un Salamander Grand Piano örneklerindendir; CC BY 3.0 lisansıyla kullanılır (https://creativecommons.org/licenses/by/3.0/).'] },
        { title: 'Görseller ve yazı tipleri', body: ['Gündüz ve gece göl manzaraları NotaNota için yapay zekâ ile üretilmiş özgün görsellerdir. Parlayan nota şekilleri Noto Music yazı tipinden, birleşik NotaNota yazısının harfleri Liberation Serif yazı tipinden alınmıştır; ikisi de SIL Open Font License 1.1 ile kullanılır (https://openfontlicense.org).'] },
        { title: 'Kendi dosyaların', body: ['Açtığın dosyalar sunucuya yüklenmez; onları biz göremeyiz.'] },
        { title: 'Bildirim', body: [`Sitedeki bir içeriğin hakkını ihlal ettiğini düşünüyorsan içeriğin adresini, hak sahipliğini ve talebini ${MAIL} adresine yaz.`] },
      ],
    },
    en: {
      status: 'Missing: there is no separate address for copyright notices yet; the contact address is used for now.',
      sections: [
        { title: 'Sample pieces', body: ['The Ode to Joy (SATB) score on the NotaNota AI page comes from the Mutopia Project (piece 528). The piece is in the public domain; it was typeset by Peter Chubb.', 'The staff lines in the practice modes are generated by the app.'] },
        { title: 'Sounds', body: ['The piano sound played on a correct answer comes from the Salamander Grand Piano samples by Alexander Holm, used under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).'] },
        { title: 'Images and typefaces', body: ['The day and night lake views are original images made for NotaNota with generative AI. The glowing note shapes come from the Noto Music typeface and the letters of the NotaNota wordmark from Liberation Serif, both used under the SIL Open Font License 1.1 (https://openfontlicense.org).'] },
        { title: 'Your files', body: ['Files you open are not uploaded; we cannot see them.'] },
        { title: 'Notices', body: [`If you believe content on the site infringes your rights, write to ${MAIL} with the address of the content, your ownership and your request.`] },
      ],
    },
  },
};

/** Removes this app's records from this browser. The Supabase session key is left alone on purpose. */
export function clearLocalData() {
  const ours = (key: string) => key.startsWith('notanota') || key.startsWith('nota-nota');
  let removed = 0;
  for (const store of [localStorage, sessionStorage]) {
    for (const key of Object.keys(store)) if (ours(key)) { store.removeItem(key); removed += 1; }
  }
  window.dispatchEvent(new Event('notanota-progress'));
  return removed;
}

export function LegalContent({ page, locale, onNavigate }: { page: LegalPage; locale: Locale; onNavigate: (target: string) => void }) {
  const doc = DOCS[page][locale];
  const tr = locale === 'tr';
  const [cleared, setCleared] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="info-page legal-page">
      <p className="kicker">NotaNota</p>
      <h1>{SITE_PAGES[page][locale][0]}</h1>
      <p className="legal-updated">{UPDATED[locale]}</p>
      <p className="legal-status" role="note">{doc.status}</p>
      {doc.sections.map((section) => (
        <section key={section.title} id={section.id}>
          <h2>{section.title}</h2>
          {section.body.map((text) => <p key={text}>{text}</p>)}
          {section.id === 'basvuru' && (
            <div className="legal-actions">
              <CommunityAccountButton label={tr ? 'Hesabım panelini aç' : 'Open the Account panel'} />
              <a className="legal-mail" href={`mailto:${MAIL}?subject=${encodeURIComponent(tr ? 'KVKK başvurusu' : 'Data request')}`}>{MAIL}</a>
            </div>
          )}
        </section>
      ))}
      {page === 'cookies' && (
        <div className="legal-actions">
          {!confirming && cleared === null && <button type="button" className="primary-button" onClick={() => setConfirming(true)}>{tr ? 'Bu cihazdaki NotaNota verilerini sil' : 'Delete NotaNota data on this device'}</button>}
          {confirming && <>
            <p>{tr ? 'İlerlemen, ders durumun ve tercihlerin bu cihazdan silinecek. Geri alınamaz.' : 'Your progress, lesson state and preferences will be removed from this device. This cannot be undone.'}</p>
            <button type="button" className="primary-button" onClick={() => { setCleared(clearLocalData()); setConfirming(false); }}>{tr ? 'Evet, sil' : 'Yes, delete'}</button>
            <button type="button" onClick={() => setConfirming(false)}>{tr ? 'Vazgeç' : 'Cancel'}</button>
          </>}
          {cleared !== null && <p role="status">{tr ? `${cleared} kayıt silindi.` : `${cleared} records deleted.`}</p>}
        </div>
      )}
      {(page === 'privacy' || page === 'cookies') && (
        <p className="legal-more">
          {tr ? 'Yasal bildirim: ' : 'Formal notice: '}
          <a href={pageRoute('kvkk', locale)} onClick={(event) => { event.preventDefault(); onNavigate('kvkk'); }}>{SITE_PAGES.kvkk[locale][0]}</a>
        </p>
      )}
    </article>
  );
}
