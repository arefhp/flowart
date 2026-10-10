import { WorkshopsScreen, workshopsMetadata } from '@/screens/events';

export const generateMetadata = () => workshopsMetadata('da');
export default function Page() {
  return <WorkshopsScreen locale="da" />;
}
