# 기숙사 학습 다이어리 - 시스템 설계 문서

## 개요

기숙사 학생이 매일 수학 공부 내용을 자유롭게 기록하고,
선생님이 데이터를 열람·코멘트하며, 학부모에게 리포트를 전달하는 웹 서비스.

---

## 1. 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend/API | Next.js API Routes (서버 액션) |
| DB / Auth / Storage | Supabase |
| PDF 생성 | @react-pdf/renderer 또는 puppeteer |
| 카카오톡 전송 | 카카오 알림톡 API (비즈니스 채널) |
| 배포 | Vercel |

---

## 2. DB 스키마 (Supabase / PostgreSQL)

### 2-1. users (Supabase Auth 확장)

```sql
-- Supabase auth.users 를 참조하는 프로필 테이블
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('student', 'teacher')),
  name        text not null,
  created_at  timestamptz default now()
);
```

### 2-2. students (학생 추가 정보)

```sql
create table students (
  id              uuid primary key references profiles(id) on delete cascade,
  parent_phone    text,          -- 학부모 카카오톡 전송용 전화번호
  teacher_id      uuid references profiles(id),
  created_at      timestamptz default now()
);
```

### 2-3. study_logs (학생 기록)

```sql
create table study_logs (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  content      text,                    -- 자유 텍스트
  image_urls   text[],                  -- Supabase Storage URL 배열
  logged_at    timestamptz default now(),
  created_at   timestamptz default now()
);
```

### 2-4. comments (선생님 코멘트)

```sql
create table comments (
  id           uuid primary key default gen_random_uuid(),
  log_id       uuid not null references study_logs(id) on delete cascade,
  teacher_id   uuid not null references profiles(id),
  content      text not null,
  created_at   timestamptz default now()
);
```

### 2-5. reports (리포트 생성 이력)

```sql
create table reports (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references profiles(id),
  student_id    uuid not null references profiles(id),
  period_start  date not null,
  period_end    date not null,
  pdf_url       text,                   -- 생성된 PDF Storage URL
  sent_kakao    boolean default false,
  created_at    timestamptz default now()
);
```

### 2-6. RLS (Row Level Security) 정책 요약

```
study_logs:
  - SELECT: 본인(student) 또는 담당 teacher
  - INSERT: student 본인만
  - UPDATE/DELETE: student 본인만

comments:
  - SELECT: 해당 log의 student 또는 teacher
  - INSERT/UPDATE/DELETE: teacher만

reports:
  - 모든 작업: teacher만
```

---

## 3. Supabase Storage 구조

```
bucket: study-images/
  {student_id}/
    {log_id}/
      {filename}

bucket: reports/
  {student_id}/
    {report_id}.pdf
```

---

## 4. API 구조 (Next.js Server Actions / Route Handlers)

### 4-1. 인증

```
POST /api/auth/login          -- Supabase Auth (이메일+비밀번호)
POST /api/auth/logout
GET  /api/auth/me             -- 현재 사용자 프로필 + role
```

### 4-2. 학습 기록 (학생)

```
GET    /api/logs              -- 내 기록 목록 (페이지네이션)
POST   /api/logs              -- 새 기록 생성 (텍스트 + 이미지 URL)
GET    /api/logs/[id]         -- 기록 상세 (코멘트 포함)
DELETE /api/logs/[id]         -- 기록 삭제 (본인만)
```

### 4-3. 이미지 업로드

```
POST /api/upload              -- Supabase Storage presigned URL 발급
                              -- 클라이언트가 직접 Storage에 업로드
```

### 4-4. 선생님 피드 / 코멘트

```
GET  /api/teacher/feed        -- 전체 학생 기록 피드 (최신순)
     ?student_id=             -- 특정 학생 필터
     ?date=                   -- 날짜 필터

POST /api/teacher/comments    -- 코멘트 작성 { log_id, content }
PUT  /api/teacher/comments/[id]
DELETE /api/teacher/comments/[id]
```

### 4-5. 리포트

```
POST /api/reports/generate    -- PDF 생성
     body: { student_id, period_start, period_end }
     → 서버에서 PDF 생성 → Storage 업로드 → URL 반환

POST /api/reports/[id]/send   -- 카카오 알림톡 발송
     → 학부모 전화번호로 PDF 링크 전송

GET  /api/reports             -- 리포트 생성 이력 목록
```

---

## 5. 화면 구조

### 5-1. 공통

```
/login              -- 로그인 (이메일 + 비밀번호)
```

### 5-2. 학생 화면

```
/student
  /dashboard        -- 내 기록 피드 (최신순) + 코멘트 확인
  /log/new          -- 새 기록 작성 (텍스트 + 이미지 업로드)
  /log/[id]         -- 기록 상세 + 선생님 코멘트
```

### 5-3. 선생님 화면

```
/teacher
  /dashboard        -- 전체 학생 피드 (학생별 필터 가능)
  /students         -- 학생 목록 관리
  /students/[id]    -- 특정 학생 기록 전체 + 코멘트 작성
  /reports          -- 리포트 생성 + 전송 이력
  /reports/new      -- 리포트 생성 (학생 선택, 기간 선택)
```

---

## 6. 주요 컴포넌트

### 학생 화면

| 컴포넌트 | 역할 |
|----------|------|
| `LogCard` | 기록 카드 (날짜, 텍스트 미리보기, 이미지 썸네일, 코멘트 수) |
| `LogForm` | 텍스트 입력 + 이미지 드래그앤드롭 업로드 |
| `CommentBubble` | 선생님 코멘트 말풍선 표시 |
| `ImageGallery` | 업로드된 이미지 그리드 |

### 선생님 화면

| 컴포넌트 | 역할 |
|----------|------|
| `TeacherFeed` | 전체/학생별 기록 피드 |
| `CommentForm` | 인라인 코멘트 작성 폼 |
| `StudentFilter` | 학생 선택 드롭다운 |
| `ReportForm` | 학생 + 기간 선택 → PDF 생성 버튼 |
| `ReportHistory` | 생성된 리포트 목록 + 카카오 전송 버튼 |

---

## 7. PDF 리포트 생성 플로우

```
선생님 → [리포트 생성 버튼] → POST /api/reports/generate
                                        ↓
                              DB에서 해당 기간 study_logs + comments 조회
                                        ↓
                              PDF 렌더링 (react-pdf 또는 puppeteer)
                              - 표지: 학생명, 기간
                              - 날짜별 기록 목록
                              - 각 기록: 텍스트 + 이미지 + 선생님 코멘트
                                        ↓
                              Supabase Storage에 PDF 업로드
                                        ↓
                              reports 테이블에 pdf_url 저장
                                        ↓
                              선생님에게 다운로드 링크 반환
```

---

## 8. 카카오 알림톡 전송 플로우

```
선생님 → [카카오 전송 버튼] → POST /api/reports/[id]/send
                                        ↓
                              reports 테이블에서 pdf_url + student_id 조회
                                        ↓
                              students 테이블에서 parent_phone 조회
                                        ↓
                              카카오 비즈니스 알림톡 API 호출
                              - 수신: 학부모 전화번호
                              - 메시지: "[학생명] 학습 리포트가 도착했습니다."
                              - 버튼: "리포트 보기" → pdf_url
                                        ↓
                              reports.sent_kakao = true 업데이트
```

> **카카오 알림톡 전제조건**: 카카오 비즈니스 채널 개설 + 알림톡 템플릿 심사 승인 필요

---

## 9. 인증 흐름

```
로그인 → Supabase Auth → JWT 발급
       → profiles.role 확인
       → 'student' → /student/dashboard 리다이렉트
       → 'teacher' → /teacher/dashboard 리다이렉트
```

미들웨어(middleware.ts)에서 role 기반 라우트 보호.

---

## 10. 확장 고려사항

| 향후 기능 | 설계 영향 |
|-----------|-----------|
| 학생 여러 명 | students.teacher_id로 이미 다중 지원 구조 |
| 과목 확장 | study_logs에 subject 컬럼 추가로 대응 |
| 학부모 앱 계정 | profiles.role에 'parent' 추가, students에 parent_id FK |
| AI 취약점 분석 | study_logs.content 배치 분석 → 키워드 추출 컬럼 추가 |

---

## 다음 단계

`/sc:implement` 로 구현 시작:
1. Supabase 프로젝트 세팅 + 스키마 마이그레이션
2. Next.js 프로젝트 초기화 + 인증 구현
3. 학생 기록 입력/조회 화면
4. 선생님 피드 + 코멘트 기능
5. PDF 생성 + 카카오 전송
