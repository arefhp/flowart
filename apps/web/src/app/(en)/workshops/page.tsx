import { WorkshopsScreen, workshopsMetadata } from '@/screens/events';

export const generateMetadata = () => workshopsMetadata('en');
export default function Page() {
  return <WorkshopsScreen locale="en" />;
}
