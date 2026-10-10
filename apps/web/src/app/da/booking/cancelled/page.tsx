import { BookingScreen, bookingMetadata } from '@/screens/booking';

export const generateMetadata = () => bookingMetadata('da', 'cancelled');
export default function Page() {
  return <BookingScreen locale="da" page="cancelled" />;
}
