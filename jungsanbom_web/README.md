# 🌸 정산봄 (JeongsanBom) - 근로자를 위한 AI 연말정산 사전점검 웹 서비스

Next.js 14 (App Router) + Supabase Google OAuth + Tailwind CSS 기반의 스타트업 웹 애플리케이션입니다.  
Vercel에 원클릭으로 즉시 배포할 수 있도록 최적화되어 있습니다.

---

## 🌟 주요 특징

1. **정산봄 스타트업 랜딩페이지**:
   - 상단 '정산봄' 브랜드 로고 및 🌸 심볼
   - 미니멀하고 전문적인 SaaS 스타트업 디자인 (블루/보라 포인트 컬러 `#4F46E5`, `#6366F1`)
   - 넉넉한 폰트와 여백, 모바일/태블릿/데스크톱 완벽 반응형
   - 국세청 간소화 제출 전 누락 공제 15가지 및 3초 예상 세액 시뮬레이션 소개
2. **Supabase & Google OAuth 로그인**:
   - 공식 4색 심볼 "Google로 시작하기" 원클릭 로그인
   - 사용자 Google 프로필 이름 및 프로필 아바타 이미지 자동 연동
   - 원클릭 로그아웃 기능
3. **사전점검 대시보드**:
   - 5단계 연말정산 사전점검 로드맵 (부양가족, 원천징수, 국세청 자료, 수기 영수증, AI 시뮬레이션)
   - 최신 절세 꿀팁, 구비서류, 과다공제 방지 가이드

---

## 🚀 로컬 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 개발 서버 실행
npm run dev

# 3. 브라우저 접속
# http://localhost:3000
```

---

## ☁️ Vercel 배포 가이드 (3분 완성)

### 1. GitHub 리포지토리 푸시
본 프로젝트 폴더(`jungsanbom_web`) 또는 전체 프로젝트를 GitHub에 푸시합니다.

### 2. Vercel에서 프로젝트 Import
1. [Vercel 대시보드](https://vercel.com)에 로그인 후 **"Add New Project"**를 클릭합니다.
2. 해당 GitHub 리포지토리를 선택합니다.
3. 만약 리포지토리 내 하위 폴더에 위치한 경우, **Root Directory**를 `jungsanbom_web`으로 설정합니다.

### 3. Vercel Environment Variables (환경변수) 등록
Vercel 설정 화면의 **Environment Variables**에 다음 2개 항목을 등록합니다:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zzqerapbftkajuadcxnj.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_73RX3HRgCdjRMPci4zOtuw_AvwaFovT` |

### 4. Supabase Redirect URL 등록 (배포 후)
Vercel에서 발급받은 실제 도메인(예: `https://your-app.vercel.app`)을 Supabase에 등록합니다:
1. [Supabase 대시보드](https://supabase.com) > 프로젝트 > **Authentication** > **URL Configuration** 이동
2. **Site URL**: `https://your-app.vercel.app`
3. **Redirect URLs**: `https://your-app.vercel.app/**` 추가 및 저장
