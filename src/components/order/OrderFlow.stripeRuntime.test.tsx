import { describe, expect, it } from 'vitest'

import { resolveStripePublishableKey } from './OrderFlow'

describe('resolveStripePublishableKey', () => {
  it('prefers explicit payment action public key from the backend contract', () => {
    expect(
      resolveStripePublishableKey(
        {
          payment_action: {
            type: 'stripe_client_secret',
            public_key: 'pk_live_backend_contract',
          },
        },
        null,
      ),
    ).toBe('pk_live_backend_contract')
  })

  it('falls back to nested raw public key when top-level field is absent', () => {
    expect(
      resolveStripePublishableKey(
        {
          payment: {
            payment_action: {
              raw: {
                public_key: 'pk_live_from_raw',
              },
            },
          },
        },
        null,
      ),
    ).toBe('pk_live_from_raw')
  })
})
