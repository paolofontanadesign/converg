import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0f0f0e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 22,
            fontWeight: 700,
            color: '#f7f4ef',
            lineHeight: 1,
            marginBottom: 2,
          }}
        >
          C
        </span>
        <div
          style={{
            position: 'absolute',
            bottom: 5,
            right: 6,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#c8472a',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
