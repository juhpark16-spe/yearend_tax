import React, { useState, useEffect, useRef } from 'react';

/**
 * 전역 배경음악(BGM) 컨트롤러 컴포넌트
 * - 첫 번째 제작된 'Cozy Focus Lounge (102 BPM)' 음원(/bgm.mp3) 재생
 * - 페이지 이동(SPA 네비게이션) 시에도 끊김 없이 지속 재생
 * - 재생/일시정지 토글, 볼륨 조절, 세련된 이퀄라이저 애니메이션
 * - 사용자 재생 설정(on/off, 볼륨) localStorage 영속화
 */
export default function BgmPlayer() {
  const audioRef = useRef(null);

  // 음원 재생 상태 (기본값: false - 브라우저 자동재생 정책 및 사용자 편의 준수)
  const [isPlaying, setIsPlaying] = useState(() => {
    try {
      return localStorage.getItem('selftax_bgm_playing') === 'true';
    } catch {
      return false;
    }
  });

  // 볼륨 상태 (0.0 ~ 1.0, 기본값 0.45: 입력 시 방해되지 않는 적절한 음량)
  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('selftax_bgm_volume');
      return saved !== null ? Number(saved) : 0.45;
    } catch {
      return 0.45;
    }
  });

  // 볼륨 슬라이더 펼침 상태
  const [isHovered, setIsHovered] = useState(false);

  // 볼륨 변경 시 오디오에 반영
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    try {
      localStorage.setItem('selftax_bgm_volume', String(volume));
    } catch {}
  }, [volume]);

  // 재생 상태 변경 시 실행
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // 브라우저 정책으로 자동 재생이 차단된 경우
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }

    try {
      localStorage.setItem('selftax_bgm_playing', String(isPlaying));
    } catch {}
  }, [isPlaying]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  return (
    <>
      {/* 백그라운드 오디오 요소 */}
      <audio
        ref={audioRef}
        src="/bgm.mp3"
        loop
        preload="auto"
      />

      {/* 화면 우측 상단 플로팅 미니 플레이어 캡슐 */}
      <div
        className="fixed bottom-6 right-5 z-50 flex items-center gap-2 select-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-full px-3 py-1.5 transition-all duration-200 hover:shadow-lg">
          {/* 재생/정지 토글 버튼 */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-indigo-600 transition cursor-pointer"
            title={isPlaying ? '배경음악 끄기' : '배경음악 켜기 (집중 BGM)'}
          >
            {/* 음파 이퀄라이저 애니메이션 */}
            <div className="flex items-end gap-0.5 w-4 h-3.5 pb-0.5">
              <span
                className={`w-0.5 rounded-full bg-indigo-600 transition-all ${
                  isPlaying ? 'h-3 animate-pulse' : 'h-1.5 bg-slate-400'
                }`}
              />
              <span
                className={`w-0.5 rounded-full bg-indigo-600 transition-all ${
                  isPlaying ? 'h-3.5 animate-bounce' : 'h-2 bg-slate-400'
                }`}
                style={{ animationDelay: '0.15s' }}
              />
              <span
                className={`w-0.5 rounded-full bg-indigo-600 transition-all ${
                  isPlaying ? 'h-2 animate-pulse' : 'h-1 bg-slate-400'
                }`}
                style={{ animationDelay: '0.3s' }}
              />
            </div>

            <span className="text-[11.5px] tracking-tight">
              {isPlaying ? 'BGM ON' : 'BGM OFF'}
            </span>
          </button>

          {/* 볼륨 슬라이더 (호버 시 부드럽게 펼쳐짐) */}
          <div
            className={`overflow-hidden transition-all duration-300 flex items-center gap-1.5 ${
              isHovered ? 'max-w-[100px] ml-2 opacity-100' : 'max-w-0 ml-0 opacity-0'
            }`}
          >
            <span className="text-[10px] text-slate-400">🔈</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-14 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              title={`볼륨: ${Math.round(volume * 100)}%`}
            />
          </div>
        </div>
      </div>
    </>
  );
}
