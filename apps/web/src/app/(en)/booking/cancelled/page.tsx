import { BookingScreen, bookingMetadata } from '@/screens/booking';

export const generateMetadata = () => bookingMetadata('en', 'cancelled');
export default function Page() {
  return <BookingScreen locale="en" page="cancelled" />;
}
