import { ContactScreen, contactMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => contactMetadata('en');
export default function Page() {
  return <ContactScreen locale="en" />;
}
