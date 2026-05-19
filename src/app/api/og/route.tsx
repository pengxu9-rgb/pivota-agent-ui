import { ImageResponse } from 'next/og';
import { renderText } from '@/pivota-font';

// Brand-gradient OG image with the Pivota Sans wordmark.
// Per handoff-pivota-sans/INTEGRATION.md §5. Returns a 1200x630 PNG
// suitable for Open Graph / Twitter card metadata.
//
// Edge runtime keeps cold-start under 100ms. We render the wordmark to
// a URL-encoded data: SVG and place it in an <img> — Satori (the renderer
// behind ImageResponse) rasterizes SVG <img> sources via resvg, but does
// not reliably honor dangerouslySetInnerHTML for inline SVG markup.

export const runtime = 'edge';

export async function GET() {
  const wordmark = renderText('pivota.', {
    weight: 'bold',
    fontSize: 200,
    color: 'white',
    tracking: 40,
  });

  const wordmarkDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(wordmark.svg)}`;

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wordmarkDataUrl}
          width={wordmark.width}
          height={wordmark.height}
          alt="Pivota"
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
