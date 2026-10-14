import React, { useState, useEffect } from 'react';

/**
 * 상단 상태바 시계: 사용자 기기의 현재 시각을 HH:MM(24시간)으로 표시하고 분이 바뀔 때마다 갱신
 */
const formatTime = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function StatusClock({ className = '' }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let intervalId;
    // 다음 정각 분까지 기다렸다가 그 뒤로는 1분마다 갱신
    const msToNextMinute = 60000 - (Date.now() % 60000);
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60000);
    }, msToNextMinute);
    // 탭을 다시 열었을 때 바로 최신 시각으로
    const onVisible = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <time className={className} dateTime={now.toISOString()} aria-label="현재 시각">
      {formatTime(now)}
    </time>
  );
}
