import { HomeScreen, homeMetadata } from '@/screens/home';

export const generateMetadata = () => homeMetadata('en');
export default function Page() {
  return <HomeScreen locale="en" />;
}
