import { AboutScreen, aboutMetadata } from '@/screens/about-contact-legal';

export const generateMetadata = () => aboutMetadata('da');
export default function Page() {
  return <AboutScreen locale="da" />;
}
