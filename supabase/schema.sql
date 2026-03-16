-- ============================================================
-- 기숙사 학습 다이어리 - Supabase Schema + RLS + Storage
-- Supabase Dashboard > SQL Editor 에서 순서대로 실행
-- ============================================================

-- ==================== TABLES ====================

-- 1. profiles (auth.users 확장)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('student', 'teacher')),
  name       text not null,
  created_at timestamptz default now()
);

-- 2. students (학생 추가 정보 + 담당 선생님 매핑)
create table if not exists students (
  id           uuid primary key references profiles(id) on delete cascade,
  teacher_id   uuid references profiles(id),
  parent_phone text,
  created_at   timestamptz default now()
);

-- 3. study_logs (학습 기록)
create table if not exists study_logs (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  content    text not null default '',
  image_urls text[] not null default '{}',
  logged_at  date not null default current_date,
  created_at timestamptz default now()
);
create index if not exists idx_study_logs_student on study_logs(student_id, logged_at desc);

-- 4. comments (선생님 코멘트)
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  log_id     uuid not null references study_logs(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);
create index if not exists idx_comments_log on comments(log_id);

-- ==================== HELPER FUNCTION ====================

-- 현재 사용자가 해당 학생의 담당 선생님인지 확인
create or replace function is_teacher_of(student_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from students
    where id = student_id
      and teacher_id = auth.uid()
  );
$$;

-- ==================== ROW LEVEL SECURITY ====================

alter table profiles   enable row level security;
alter table students   enable row level security;
alter table study_logs enable row level security;
alter table comments   enable row level security;

-- ---- profiles ----
-- 본인 프로필 조회
create policy "profiles: own select"
  on profiles for select
  using (auth.uid() = id);

-- 선생님이 자기 학생 프로필 조회
create policy "profiles: teacher reads students"
  on profiles for select
  using (is_teacher_of(id));

-- 본인 프로필 수정
create policy "profiles: own update"
  on profiles for update
  using (auth.uid() = id);

-- 회원가입 시 본인 프로필 생성 (trigger에서 호출하거나 직접)
create policy "profiles: own insert"
  on profiles for insert
  with check (auth.uid() = id);

-- ---- students ----
-- 본인 student 레코드 조회
create policy "students: own select"
  on students for select
  using (auth.uid() = id);

-- 선생님이 자기 학생 목록 조회
create policy "students: teacher reads own students"
  on students for select
  using (auth.uid() = teacher_id);

-- ---- study_logs ----
-- 학생: 본인 기록 조회
create policy "logs: student reads own"
  on study_logs for select
  using (auth.uid() = student_id);

-- 선생님: 담당 학생 기록 조회
create policy "logs: teacher reads assigned"
  on study_logs for select
  using (is_teacher_of(student_id));

-- 학생: 본인 기록 작성
create policy "logs: student insert own"
  on study_logs for insert
  with check (auth.uid() = student_id);

-- 학생: 본인 기록 수정
create policy "logs: student update own"
  on study_logs for update
  using (auth.uid() = student_id);

-- 학생: 본인 기록 삭제
create policy "logs: student delete own"
  on study_logs for delete
  using (auth.uid() = student_id);

-- ---- comments ----
-- 학생: 자기 기록의 코멘트 조회
create policy "comments: student reads on own logs"
  on comments for select
  using (
    exists (
      select 1 from study_logs
      where id = log_id
        and student_id = auth.uid()
    )
  );

-- 선생님: 자기가 쓴 코멘트 조회
create policy "comments: teacher reads own"
  on comments for select
  using (auth.uid() = teacher_id);

-- 선생님: 담당 학생 기록에 코멘트 작성
create policy "comments: teacher insert"
  on comments for insert
  with check (
    auth.uid() = teacher_id
    and exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
    and is_teacher_of((select student_id from study_logs where id = log_id))
  );

-- 선생님: 본인 코멘트 수정
create policy "comments: teacher update own"
  on comments for update
  using (auth.uid() = teacher_id);

-- 선생님: 본인 코멘트 삭제
create policy "comments: teacher delete own"
  on comments for delete
  using (auth.uid() = teacher_id);

-- ==================== STORAGE ====================
-- Dashboard > Storage 에서 'study-images' 버킷 생성 (Private)
-- 아래 정책을 SQL Editor에서 실행

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-images',
  'study-images',
  false,
  10485760,  -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do nothing;

-- 학생: 자기 폴더에만 업로드 (경로: {student_id}/...)
create policy "storage: student upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'study-images'
    and auth.uid()::text = (storage.foldername(name))[1]
    and exists (select 1 from profiles where id = auth.uid() and role = 'student')
  );

-- 학생: 자기 파일 읽기
create policy "storage: student read own"
  on storage.objects for select
  using (
    bucket_id = 'study-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 선생님: 담당 학생 파일 읽기
create policy "storage: teacher read assigned students"
  on storage.objects for select
  using (
    bucket_id = 'study-images'
    and exists (
      select 1 from students
      where id::text = (storage.foldername(name))[1]
        and teacher_id = auth.uid()
    )
  );

-- 학생: 자기 파일 삭제
create policy "storage: student delete own"
  on storage.objects for delete
  using (
    bucket_id = 'study-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ==================== AUTH TRIGGER ====================
-- 회원가입 시 자동으로 profiles 레코드 생성
-- (role, name 은 회원가입 시 user_metadata에 넣어야 함)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, role, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'name', '이름없음')
  );

  -- 학생이면 students 레코드도 생성
  if coalesce(new.raw_user_meta_data->>'role', 'student') = 'student' then
    insert into students (id, teacher_id)
    values (
      new.id,
      (new.raw_user_meta_data->>'teacher_id')::uuid
    );
  end if;

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ==================== SAMPLE DATA (선택) ====================
-- 실제 사용 시 Supabase Auth에서 직접 계정 생성 후 아래 방식으로 추가
-- 선생님 계정 생성 후:
--   insert into profiles (id, role, name) values ('<teacher_uuid>', 'teacher', '박선생님');
-- 학생 계정 생성 후:
--   insert into profiles (id, role, name) values ('<student_uuid>', 'student', '김민준');
--   insert into students (id, teacher_id) values ('<student_uuid>', '<teacher_uuid>');
