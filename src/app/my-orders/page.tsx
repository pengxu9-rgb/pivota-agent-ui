import { Suspense } from 'react'
import OrdersPage from '../orders/page'

export default function MyOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPage />
    </Suspense>
  )
}
