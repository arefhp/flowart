import { ContactScreen, contactMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => contactMetadata('da');
export default function Page() {
  return <ContactScreen locale="da" />;
}
