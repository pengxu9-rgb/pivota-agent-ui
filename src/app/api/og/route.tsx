import { ImageResponse } from 'next/og';
import { renderText } from '@/pivota-font';

// Brand-gradient OG image with the Pivota Sans wordmark.
// Per handoff-pivota-sans/INTEGRATION.md §5. Returns a 1200x630 PNG
// suitable for Open Graph / Twitter card metadata.
//
// Edge runtime keeps the cold-start under 100ms; ImageResponse rasterizes
// via Satori, which renders the wordmark SVG inline via dangerouslySetInnerHTML.

export const runtime = 'edge';

export async function GET() {
  const wordmark = renderText('pivota.', {
    weight: 'bold',
    fontSize: 200,
    color: 'white',
    tracking: 40,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #534AB7 0%, #7B6FD4 50%, #1D9E75 100%)',
        }}
      >
        <div
          style={{ display: 'flex' }}
          dangerouslySetInnerHTML={{ __html: wordmark.svg }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
