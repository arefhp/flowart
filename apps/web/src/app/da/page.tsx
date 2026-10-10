import { HomeScreen, homeMetadata } from '@/screens/home';

export const generateMetadata = () => homeMetadata('da');
export default function Page() {
  return <HomeScreen locale="da" />;
}
