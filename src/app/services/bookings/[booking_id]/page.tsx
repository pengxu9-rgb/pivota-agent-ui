import ConfirmationPage from './ConfirmationPage';

export default async function ServiceBookingPage({ params }: { params: Promise<{ booking_id: string }> }) {
  const { booking_id } = await params;
  return <ConfirmationPage bookingId={booking_id} />;
}
