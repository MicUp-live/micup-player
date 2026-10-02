import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';

export function QRCodeView({ text, size = 200, color = '#ff2a5f', bgColor = '#00000000' }) {
  const [svgContent, setSvgContent] = useState('');

  useEffect(() => {
    if (!text) {
      setSvgContent('');
      return;
    }

    QRCode.toString(text, {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: color,
        light: bgColor
      }
    }).then((svg) => {
      setSvgContent(svg);
    }).catch((err) => {
      console.warn('QR code generation error:', err);
    });
  }, [text, size, color, bgColor]);

  if (!svgContent) {
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: '12px'
      }}>
        Generating QR...
      </div>
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
