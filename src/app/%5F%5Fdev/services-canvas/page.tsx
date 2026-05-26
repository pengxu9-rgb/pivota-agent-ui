import { notFound } from 'next/navigation';
import ServicesCanvas from './ServicesCanvas';

export default function ServicesCanvasPage() {
  if (process.env.NEXT_PUBLIC_BEAUTY_SERVICES_DEV_FIXTURES !== '1') {
    notFound();
  }

  return <ServicesCanvas />;
}
