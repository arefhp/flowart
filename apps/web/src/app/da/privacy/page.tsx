import { LegalScreen, legalMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => legalMetadata('da', 'privacy');
export default function Page() {
  return <LegalScreen locale="da" kind="privacy" />;
}
