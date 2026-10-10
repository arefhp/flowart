import { CalendarScreen, calendarMetadata } from '@/screens/events';

export const generateMetadata = () => calendarMetadata('en');
export default function Page() {
  return <CalendarScreen locale="en" />;
}
