import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { initSecureStorage } from './utils/secureStorage';
import './index.css';

const render = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  );
};

// 브라우저 저장소 암호화(AES-GCM) 준비 후 렌더링: 저장된 자료를 복호화해 두어야 화면이 바로 읽을 수 있다
initSecureStorage()
  .catch((err) => console.error('[secureStorage] 초기화 실패 — 암호화 없이 시작합니다.', err))
  .finally(render);
