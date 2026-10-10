import { CalendarScreen, calendarMetadata } from '@/screens/events';

export const generateMetadata = () => calendarMetadata('da');
export default function Page() {
  return <CalendarScreen locale="da" />;
}
