import { Suspense } from 'react';
import ServicesBrowsePage from './ServicesBrowsePage';
import Loading from './loading';

export default function ServicesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ServicesBrowsePage />
    </Suspense>
  );
}
