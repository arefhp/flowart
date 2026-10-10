import { BookingScreen, bookingMetadata } from '@/screens/booking';

export const generateMetadata = () => bookingMetadata('da', 'success');
export default function Page() {
  return <BookingScreen locale="da" page="success" />;
}
