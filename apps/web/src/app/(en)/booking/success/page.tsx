import { BookingScreen, bookingMetadata } from '@/screens/booking';

export const generateMetadata = () => bookingMetadata('en', 'success');
export default function Page() {
  return <BookingScreen locale="en" page="success" />;
}
