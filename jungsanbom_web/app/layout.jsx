import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata = {
  title: '정산봄 | 근로자를 위한 AI 연말정산 사전점검',
  description: '국세청 간소화 자료 제출 전, 누락 공제와 예상 세액을 AI로 사전 점검하는 스마트 연말정산 서비스',
  keywords: ['정산봄', '연말정산', 'AI 연말정산', '사전점검', '절세꿀팁', '세액공제', '소득공제'],
  openGraph: {
    title: '정산봄 | 근로자를 위한 AI 연말정산 사전점검',
    description: '국세청 간소화 자료 제출 전, AI로 누락 공제 15가지를 미리 점검하세요.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 antialiased selection:bg-indigo-500 selection:text-white">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
