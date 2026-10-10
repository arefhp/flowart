import { LegalScreen, legalMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => legalMetadata('en', 'terms');
export default function Page() {
  return <LegalScreen locale="en" kind="terms" />;
}
