import { AboutScreen, aboutMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => aboutMetadata('en');
export default function Page() {
  return <AboutScreen locale="en" />;
}
