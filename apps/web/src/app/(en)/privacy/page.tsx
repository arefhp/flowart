import { LegalScreen, legalMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => legalMetadata('en', 'privacy');
export default function Page() {
  return <LegalScreen locale="en" kind="privacy" />;
}
