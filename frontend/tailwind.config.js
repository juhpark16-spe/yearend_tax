/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        godash: {
          primary: '#DCEB9F',    // Primary Green (포인트 라임그린)
          primaryHover: '#CDDC8E',
          bg: '#F8F9FA',         // 메인 배경 (매우 옅은 그레이/오프화이트)
          surface: '#FFFFFF',    // 카드/박스 배경 (순백색)
          dark: '#111111',       // 메인 다크/헤더 (블랙)
          darkSurface: '#1A1A1A',
          darkMuted: '#2A2A2A',
          textPrimary: '#111111', // 강조 텍스트 (블랙)
          textSecondary: '#666666', // 보조 텍스트 (다크 그레이)
          textMuted: '#888888',
          border: '#EBECEF',
        },
      },
      spacing: {
        '4.5': '1.125rem',
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'mobile-frame': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
