import type { Locale } from '@flowart/shared';

/**
 * Source text: docs/LANGUAGE_REVIEW.md, Parts B and C (owner-approved, deliberately plain).
 * Do not add legal clauses here that are not in that file. Never mention VAT, phone or address.
 */
export type LegalBlock =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export interface LegalDoc {
  title: string;
  blocks: LegalBlock[];
}

const termsEn: LegalDoc = {
  title: 'Terms for workshops and events',
  blocks: [
    { type: 'h2', text: 'Who we are' },
    {
      type: 'p',
      text: 'These terms apply to workshops and events offered on zfadavi.com by Flow Art (CVR 42674249), trading as Zakereh Art, Copenhagen. You can always reach us at info@zfadavi.com.',
    },
    { type: 'h2', text: 'Booking' },
    {
      type: 'p',
      text: 'Choose an event, enter your name and email, choose the number of participants (up to 10 per booking), accept these terms and pay by card. Your places are held for 30 minutes while you pay. Your booking is confirmed as soon as your payment is received, and we then send you a confirmation by email.',
    },
    { type: 'h2', text: 'Prices and payment' },
    {
      type: 'p',
      text: 'Prices are in Danish kroner (DKK) per person. Payment is handled securely by Stripe, so we never see or store your card details.',
    },
    { type: 'h2', text: 'If you need to cancel' },
    {
      type: 'p',
      text: 'Email us at info@zfadavi.com **at least 24 hours before the workshop starts** and you will receive a **full refund** to the card you paid with. It normally reaches you within a few business days, depending on your bank. If you write to us later than that, the full-refund rule no longer applies, but please do get in touch and we will see what we can do.',
    },
    { type: 'h2', text: 'If we need to cancel' },
    {
      type: 'p',
      text: 'If we cancel a workshop or event, you will receive a **full refund** automatically and we will let you know by email. We may also offer you another date.',
    },
    { type: 'h2', text: 'Questions' },
    { type: 'p', text: 'We are happy to help. Write to us at info@zfadavi.com.' },
  ],
};

const termsDa: LegalDoc = {
  title: 'Vilkår for workshops og events',
  blocks: [
    { type: 'h2', text: 'Hvem vi er' },
    {
      type: 'p',
      text: 'Disse vilkår gælder for workshops og events på zfadavi.com, udbudt af Flow Art (CVR 42674249) under navnet Zakereh Art, København. Du kan altid træffe os på info@zfadavi.com.',
    },
    { type: 'h2', text: 'Booking' },
    {
      type: 'p',
      text: 'Vælg et event, skriv dit navn og din e-mailadresse, vælg antal deltagere (op til 10 pr. booking), accepter disse vilkår og betal med kort. Dine pladser er reserveret i 30 minutter, mens du betaler. Din booking er bekræftet, så snart vi har modtaget din betaling, og du får derefter en bekræftelse på e-mail.',
    },
    { type: 'h2', text: 'Priser og betaling' },
    {
      type: 'p',
      text: 'Priserne er i danske kroner (DKK) pr. person. Betalingen håndteres sikkert af Stripe, så vi ser eller gemmer aldrig dine kortoplysninger.',
    },
    { type: 'h2', text: 'Hvis du skal afbestille' },
    {
      type: 'p',
      text: 'Skriv til os på info@zfadavi.com **senest 24 timer før workshoppen starter**, så får du **hele beløbet refunderet** til det kort, du betalte med. Pengene når normalt frem inden for nogle få bankdage, afhængigt af din bank. Skriver du senere, gælder reglen om fuld refusion ikke længere, men kontakt os endelig alligevel, så ser vi, hvad vi kan gøre.',
    },
    { type: 'h2', text: 'Hvis vi må aflyse' },
    {
      type: 'p',
      text: 'Aflyser vi en workshop eller et event, får du **hele beløbet refunderet** automatisk, og vi giver dig besked på e-mail. Vi kan også tilbyde dig en anden dato.',
    },
    { type: 'h2', text: 'Spørgsmål' },
    { type: 'p', text: 'Vi hjælper gerne. Skriv til os på info@zfadavi.com.' },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy policy',
  blocks: [
    { type: 'h2', text: 'Who we are' },
    {
      type: 'p',
      text: 'Flow Art (CVR 42674249), trading as Zakereh Art, Copenhagen, is responsible for your personal data. Contact: info@zfadavi.com.',
    },
    { type: 'h2', text: 'What we collect and why' },
    {
      type: 'ul',
      items: [
        '**When you book a workshop:** your name, email, number of participants and, if you choose to give it, a phone number. We use it to handle your booking, send your confirmation and contact you about the event.',
        '**When you pay or are refunded:** the amount, date and a payment reference, so we can keep our accounts.',
        '**When you send us a message:** your name, email and message (and the artwork you ask about), so we can reply.',
        '**Basic technical information** (such as your IP address) is processed to keep the website secure and to prevent spam.',
      ],
    },
    { type: 'p', text: 'We do not use advertising or analytics trackers.' },
    { type: 'h2', text: 'Who helps us' },
    {
      type: 'p',
      text: 'We use Cloudflare (website hosting, storage, email forwarding and spam protection), Stripe (card payments) and Resend (sending emails such as booking confirmations). They handle your data only to provide their service. We do not sell your data.',
    },
    { type: 'h2', text: 'How long we keep it' },
    {
      type: 'p',
      text: 'We keep booking and payment information as long as we need it for our accounts and legal obligations. Messages are kept only as long as needed to answer you and follow up.',
    },
    { type: 'h2', text: 'Your rights' },
    {
      type: 'p',
      text: 'You can ask us to show you, correct or delete your data, or to limit how we use it. Just write to info@zfadavi.com. You can also contact the Danish Data Protection Agency (Datatilsynet).',
    },
    { type: 'h2', text: 'Social media' },
    {
      type: 'p',
      text: 'The links to Instagram, Facebook and TikTok are ordinary links. They do not load anything from those services on our site.',
    },
  ],
};

const privacyDa: LegalDoc = {
  title: 'Privatlivspolitik',
  blocks: [
    { type: 'h2', text: 'Hvem vi er' },
    {
      type: 'p',
      text: 'Flow Art (CVR 42674249) under navnet Zakereh Art, København, er ansvarlig for dine personoplysninger. Kontakt: info@zfadavi.com.',
    },
    { type: 'h2', text: 'Hvad vi indsamler, og hvorfor' },
    {
      type: 'ul',
      items: [
        '**Når du booker en workshop:** dit navn, din e-mailadresse, antal deltagere og, hvis du vil, et telefonnummer. Vi bruger det til at håndtere din booking, sende din bekræftelse og kontakte dig om eventet.',
        '**Når du betaler eller får refunderet:** beløb, dato og en betalingsreference, så vi kan føre vores regnskab.',
        '**Når du sender os en besked:** dit navn, din e-mailadresse og din besked (og det værk, du spørger til), så vi kan svare dig.',
        '**Grundlæggende tekniske oplysninger** (som din IP-adresse) behandles for at holde hjemmesiden sikker og forhindre spam.',
      ],
    },
    { type: 'p', text: 'Vi bruger ikke reklame- eller analysecookies.' },
    { type: 'h2', text: 'Hvem hjælper os' },
    {
      type: 'p',
      text: 'Vi bruger Cloudflare (hosting af hjemmesiden, lagring, videresendelse af e-mail og spambeskyttelse), Stripe (kortbetalinger) og Resend (afsendelse af e-mails som bookingbekræftelser). De behandler kun dine oplysninger for at levere deres ydelse. Vi sælger ikke dine oplysninger.',
    },
    { type: 'h2', text: 'Hvor længe vi gemmer dem' },
    {
      type: 'p',
      text: 'Vi gemmer booking- og betalingsoplysninger, så længe vi har brug for dem til vores regnskab og vores lovmæssige forpligtelser. Beskeder gemmes kun, så længe det er nødvendigt for at svare dig og følge op.',
    },
    { type: 'h2', text: 'Dine rettigheder' },
    {
      type: 'p',
      text: 'Du kan bede os om at vise, rette eller slette dine oplysninger eller begrænse, hvordan vi bruger dem. Skriv blot til info@zfadavi.com. Du kan også kontakte Datatilsynet.',
    },
    { type: 'h2', text: 'Sociale medier' },
    {
      type: 'p',
      text: 'Linkene til Instagram, Facebook og TikTok er almindelige links. De indlæser ikke noget fra tjenesterne på vores hjemmeside.',
    },
  ],
};

export const legalDocs: Record<'terms' | 'privacy', Record<Locale, LegalDoc>> = {
  terms: { en: termsEn, da: termsDa },
  privacy: { en: privacyEn, da: privacyDa },
};
