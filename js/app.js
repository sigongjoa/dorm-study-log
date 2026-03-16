import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ============================================================
// Supabase 초기화
// ============================================================
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ============================================================
// 앱 상태
// ============================================================
let currentUser   = null;  // { id }
let currentProfile = null; // { id, role, name }
let currentLogId  = null;  // 학생 상세 화면용
let currentTeacherLogId = null; // 선생님 상세 화면용
let studentFilter = 'all'; // 선생님 피드 학생 필터

// ============================================================
// 초기화
// ============================================================
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await loadProfile(session.user.id);
    routeByRole();
  } else {
    show('login');
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadProfile(session.user.id);
      routeByRole();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      show('login');
    }
  });
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, name')
    .eq('id', userId)
    .single();

  if (error || !data) {
    toast('프로필을 불러오지 못했습니다. 관리자에게 문의하세요.');
    await supabase.auth.signOut();
    return;
  }
  currentUser = { id: userId };
  currentProfile = data;
}

function routeByRole() {
  if (!currentProfile) { show('login'); return; }
  if (currentProfile.role === 'student') {
    loadStudentHome();
  } else if (currentProfile.role === 'teacher') {
    studentFilter = 'all';
    loadTeacherFeed();
  } else {
    toast('알 수 없는 역할입니다.');
    supabase.auth.signOut();
  }
}

// ============================================================
// 공통 유틸
// ============================================================
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) {
    target.classList.add('active');
    target.classList.remove('fade-in');
    void target.offsetWidth;
    target.classList.add('fade-in');
    window.scrollTo(0, 0);
  }
}

function toast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), duration);
}

// XSS 방지: 모든 사용자 입력은 textContent 또는 이 함수를 통해 삽입
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = d.getHours();
  const ampm = h >= 12 ? '오후' : '오전';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${formatDate(isoStr)} ${ampm} ${hour}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${diff}일 전`;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const now = new Date();
  const d = new Date(isoStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) {
    const h = d.getHours(), ampm = h >= 12 ? '오후' : '오전';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `오늘 ${ampm} ${hour}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (diff < 172800) return '어제';
  return formatDate(isoStr);
}

// ============================================================
// 인증
// ============================================================
async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { toast('이메일과 비밀번호를 입력해주세요.'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = '로그인 중...';

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = '로그인';

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      toast('이메일 또는 비밀번호가 올바르지 않습니다.');
    } else if (error.message.includes('Email not confirmed')) {
      toast('이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.');
    } else {
      toast('로그인 실패: ' + error.message);
    }
  }
}

async function logout() {
  await supabase.auth.signOut();
}

// ============================================================
// 학생: 홈 (기록 피드)
// ============================================================
async function loadStudentHome() {
  show('student-home');

  const nameEl = document.getElementById('student-name');
  nameEl.textContent = (currentProfile?.name ?? '') + '님의 기록';

  const listEl = document.getElementById('student-log-list');
  listEl.innerHTML = '<div class="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>';

  const { data: logs, error } = await supabase
    .from('study_logs')
    .select('id, content, image_urls, logged_at, comments(id)')
    .eq('student_id', currentUser.id)
    .order('logged_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = '<div class="text-center py-10 text-red-400 text-sm">기록을 불러오지 못했습니다.</div>';
    return;
  }

  if (!logs || logs.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-20 text-gray-400">
        <div class="text-4xl mb-3">📝</div>
        <p class="text-sm">아직 기록이 없어요.</p>
        <p class="text-xs mt-1">첫 번째 학습 기록을 남겨보세요!</p>
      </div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const colors = [
    'bg-blue-50',
    'bg-purple-50',
    'bg-emerald-50',
    'bg-amber-50',
  ];

  listEl.innerHTML = logs.map((log, i) => {
    const isToday     = log.logged_at === today;
    const hasComment  = log.comments && log.comments.length > 0;
    const hasImages   = log.image_urls && log.image_urls.length > 0;
    const dateLabel   = isToday
      ? '<span class="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">오늘</span>'
      : `<span class="text-xs text-gray-400">${escapeHtml(daysAgo(log.logged_at))}</span>`;

    const imagesHtml = hasImages
      ? `<div class="flex gap-1 mr-2">
          ${log.image_urls.slice(0, 2).map(url =>
            `<div class="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
               <img src="${escapeHtml(url)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'" />
             </div>`
          ).join('')}
          ${log.image_urls.length > 2 ? `<div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400">+${log.image_urls.length - 2}</div>` : ''}
        </div>`
      : '';

    const commentBadge = hasComment
      ? '<div class="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><span>💬</span><span>코멘트</span></div>'
      : '<span class="text-xs text-gray-400">코멘트 없음</span>';

    return `
      <div onclick="loadStudentDetail('${escapeHtml(log.id)}')"
           class="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm cursor-pointer active:bg-gray-50 transition">
        <div class="flex items-center justify-between mb-2">
          ${dateLabel}
          <span class="text-xs text-gray-400">${escapeHtml(formatDate(log.logged_at))}</span>
        </div>
        <p class="text-sm text-gray-700 leading-relaxed line-clamp-3">${escapeHtml(log.content)}</p>
        <div class="flex items-center mt-3">
          ${imagesHtml}
          <div class="ml-auto">${commentBadge}</div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// 학생: 기록 작성
// ============================================================
function showStudentWrite() {
  document.getElementById('log-text').value = '';
  document.getElementById('preview-container').innerHTML = '';
  document.getElementById('write-date').textContent = formatDateKo(new Date().toISOString());
  const btn = document.getElementById('submit-log-btn');
  btn.disabled = false;
  btn.textContent = '기록 저장하기';
  show('student-write');
}

async function previewImages(input) {
  const container = document.getElementById('preview-container');
  container.innerHTML = '';

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  for (const file of Array.from(input.files)) {
    if (!allowed.includes(file.type)) {
      toast(`${file.name}: 이미지 파일만 업로드 가능합니다.`);
      continue;
    }
    if (file.size > maxSize) {
      toast(`${file.name}: 10MB 이하 파일만 업로드 가능합니다.`);
      continue;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative w-20 h-20';
      wrapper.innerHTML = `
        <img src="${e.target.result}" class="w-20 h-20 object-cover rounded-xl" />
        <div class="absolute inset-0 rounded-xl bg-black bg-opacity-0 hover:bg-opacity-20 transition"></div>`;
      container.appendChild(wrapper);
    };
    reader.readAsDataURL(file);
  }
}

async function submitLog() {
  const content = document.getElementById('log-text').value.trim();
  if (!content) { toast('공부 내용을 입력해주세요.'); return; }
  if (content.length > 5000) { toast('내용이 너무 깁니다. (최대 5000자)'); return; }

  const btn = document.getElementById('submit-log-btn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const imageUrls = await uploadImages();

    const { error } = await supabase.from('study_logs').insert({
      student_id: currentUser.id,
      content,
      image_urls: imageUrls,
      logged_at:  new Date().toISOString().slice(0, 10),
    });

    if (error) throw error;

    toast('기록이 저장되었어요!');
    setTimeout(() => loadStudentHome(), 1200);
  } catch (err) {
    toast('저장 실패: ' + err.message);
    btn.disabled = false;
    btn.textContent = '기록 저장하기';
  }
}

async function uploadImages() {
  const input = document.querySelector('#screen-student-write input[type="file"]');
  if (!input || !input.files.length) return [];

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
  const urls = [];

  for (const file of Array.from(input.files)) {
    if (!allowed.includes(file.type)) continue;
    if (file.size > 10 * 1024 * 1024) continue;

    // 파일명 sanitize
    const ext  = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${currentUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from('study-images')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw new Error('이미지 업로드 실패: ' + error.message);

    const { data: { publicUrl } } = supabase.storage
      .from('study-images')
      .getPublicUrl(path);

    urls.push(publicUrl);
  }
  return urls;
}

// ============================================================
// 학생: 기록 상세
// ============================================================
async function loadStudentDetail(logId) {
  currentLogId = logId;
  show('student-detail');

  const dateEl    = document.getElementById('detail-date');
  const contentEl = document.getElementById('detail-content');
  const imagesEl  = document.getElementById('detail-images');
  const commentEl = document.getElementById('detail-comment');

  contentEl.textContent = '불러오는 중...';

  const { data: log, error } = await supabase
    .from('study_logs')
    .select('*, comments(*, profiles(name))')
    .eq('id', logId)
    .single();

  if (error || !log) {
    contentEl.textContent = '기록을 불러오지 못했습니다.';
    return;
  }

  dateEl.textContent    = formatDateKo(log.logged_at);
  contentEl.textContent = log.content;

  imagesEl.innerHTML = (log.image_urls || []).map(url =>
    `<img src="${escapeHtml(url)}"
          class="w-20 h-20 rounded-xl object-cover cursor-pointer border border-gray-100"
          onclick="openImage('${escapeHtml(url)}')"
          loading="lazy"
          onerror="this.style.display='none'" />`
  ).join('');

  if (log.comments && log.comments.length > 0) {
    const comment = log.comments[0];
    const teacherName = escapeHtml(comment.profiles?.name ?? '선생님');
    commentEl.innerHTML = `
      <p class="text-xs font-medium text-gray-400 mb-3">선생님 코멘트</p>
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">👨‍🏫</div>
        <div class="bg-blue-50 rounded-2xl rounded-tl-none px-4 py-3 flex-1">
          <p class="text-xs font-semibold text-blue-700 mb-1">${teacherName}</p>
          <p class="text-sm text-gray-700 leading-relaxed">${escapeHtml(comment.content)}</p>
          <p class="text-xs text-gray-400 mt-2">${escapeHtml(formatDateTime(comment.created_at))}</p>
        </div>
      </div>`;
  } else {
    commentEl.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">아직 선생님 코멘트가 없어요.</p>';
  }
}

// ============================================================
// 이미지 오버레이
// ============================================================
function openImage(url) {
  const overlay = document.getElementById('image-overlay');
  document.getElementById('overlay-img').src = url;
  overlay.classList.remove('hidden');
}

function closeImageOverlay() {
  document.getElementById('image-overlay').classList.add('hidden');
  document.getElementById('overlay-img').src = '';
}

// ============================================================
// 선생님: 피드
// ============================================================
async function loadTeacherFeed(filter) {
  if (filter !== undefined) studentFilter = filter;
  show('teacher-feed');

  const listEl = document.getElementById('teacher-feed-list');
  listEl.innerHTML = '<div class="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>';

  // 담당 학생 목록
  const { data: myStudents } = await supabase
    .from('students')
    .select('id, profiles(name)')
    .eq('teacher_id', currentUser.id);

  renderStudentFilters(myStudents ?? []);

  if (!myStudents || myStudents.length === 0) {
    listEl.innerHTML = '<div class="text-center py-16 text-gray-400 text-sm">담당 학생이 없습니다.<br>관리자에게 학생 배정을 요청하세요.</div>';
    return;
  }

  const studentIds = myStudents.map(s => s.id);

  let query = supabase
    .from('study_logs')
    .select('id, content, image_urls, logged_at, created_at, student_id, profiles!student_id(name), comments(id)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (studentFilter !== 'all' && studentFilter) {
    query = query.eq('student_id', studentFilter);
  } else {
    query = query.in('student_id', studentIds);
  }

  const { data: logs, error } = await query;

  if (error) {
    listEl.innerHTML = '<div class="text-center py-10 text-red-400 text-sm">피드를 불러오지 못했습니다.</div>';
    return;
  }

  if (!logs || logs.length === 0) {
    listEl.innerHTML = '<div class="text-center py-16 text-gray-400 text-sm">아직 기록이 없습니다.</div>';
    return;
  }

  const colorMap = ['bg-blue-100 text-blue-600', 'bg-rose-100 text-rose-600', 'bg-amber-100 text-amber-600', 'bg-emerald-100 text-emerald-600', 'bg-purple-100 text-purple-600'];

  listEl.innerHTML = logs.map(log => {
    const hasComment  = log.comments && log.comments.length > 0;
    const hasImages   = log.image_urls && log.image_urls.length > 0;
    const studentName = log.profiles?.name ?? '학생';
    const initial     = studentName[0] ?? '?';
    const colorIdx    = studentName.charCodeAt(0) % colorMap.length;

    return `
      <div onclick="loadTeacherDetail('${escapeHtml(log.id)}')"
           class="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm cursor-pointer hover:border-blue-200 transition">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-7 h-7 rounded-full ${colorMap[colorIdx]} text-xs flex items-center justify-center font-bold flex-shrink-0">
            ${escapeHtml(initial)}
          </div>
          <span class="text-sm font-semibold text-gray-800">${escapeHtml(studentName)}</span>
          <span class="ml-auto text-xs text-gray-400">${escapeHtml(timeAgo(log.created_at))}</span>
        </div>
        <p class="text-sm text-gray-600 leading-relaxed line-clamp-3">${escapeHtml(log.content)}</p>
        <div class="flex items-center gap-2 mt-3">
          ${hasImages
            ? `<div class="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                 <img src="${escapeHtml(log.image_urls[0])}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'" />
               </div>`
            : ''}
          ${hasComment
            ? '<span class="ml-auto text-xs text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">답변 완료</span>'
            : '<span class="ml-auto text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">미응답</span>'}
        </div>
      </div>`;
  }).join('');
}

function renderStudentFilters(students) {
  const filterEl = document.getElementById('student-filter');
  const allActive = studentFilter === 'all';

  filterEl.innerHTML = `
    <button onclick="loadTeacherFeed('all')"
            class="filter-btn whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition
                   ${allActive ? 'bg-blue-500 text-white font-medium' : 'bg-gray-100 text-gray-600'}">전체</button>
    ${students.map(s => {
      const active = studentFilter === s.id;
      return `<button onclick="loadTeacherFeed('${escapeHtml(s.id)}')"
                      class="filter-btn whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition
                             ${active ? 'bg-blue-500 text-white font-medium' : 'bg-gray-100 text-gray-600'}">
                ${escapeHtml(s.profiles?.name ?? '학생')}
              </button>`;
    }).join('')}`;
}

// ============================================================
// 선생님: 기록 상세 + 코멘트
// ============================================================
async function loadTeacherDetail(logId) {
  currentTeacherLogId = logId;
  show('teacher-detail');

  const headerEl  = document.getElementById('teacher-detail-header');
  const contentEl = document.getElementById('teacher-detail-content');
  const imagesEl  = document.getElementById('teacher-detail-images');
  const commentTextEl = document.getElementById('comment-text');

  contentEl.textContent = '불러오는 중...';

  const { data: log, error } = await supabase
    .from('study_logs')
    .select('*, profiles!student_id(name), comments(*, profiles(name))')
    .eq('id', logId)
    .single();

  if (error || !log) {
    contentEl.textContent = '기록을 불러오지 못했습니다.';
    return;
  }

  headerEl.textContent  = `${log.profiles?.name ?? '학생'} · ${formatDateShort(log.logged_at)}`;
  contentEl.textContent = log.content;

  imagesEl.innerHTML = (log.image_urls || []).map(url =>
    `<img src="${escapeHtml(url)}"
          class="w-20 h-20 rounded-xl object-cover cursor-pointer border border-gray-100"
          onclick="openImage('${escapeHtml(url)}')"
          loading="lazy"
          onerror="this.style.display='none'" />`
  ).join('');

  // 기존 코멘트 표시
  const existingComment = log.comments?.find(c => c.teacher_id === currentUser.id);
  commentTextEl.value = existingComment ? existingComment.content : '';

  const btn = document.getElementById('submit-comment-btn');
  btn.disabled = false;
  btn.textContent = existingComment ? '코멘트 수정' : '코멘트 전송';
}

async function submitComment() {
  const content = document.getElementById('comment-text').value.trim();
  if (!content) { toast('코멘트를 입력해주세요.'); return; }
  if (content.length > 2000) { toast('코멘트가 너무 깁니다. (최대 2000자)'); return; }

  const btn = document.getElementById('submit-comment-btn');
  btn.disabled = true;
  btn.textContent = '전송 중...';

  try {
    const { data: existing } = await supabase
      .from('comments')
      .select('id')
      .eq('log_id', currentTeacherLogId)
      .eq('teacher_id', currentUser.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('comments')
        .update({ content })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('comments').insert({
        log_id:     currentTeacherLogId,
        teacher_id: currentUser.id,
        content,
      });
      if (error) throw error;
    }

    toast('코멘트가 전송되었어요!');
    setTimeout(() => loadTeacherFeed(), 1200);
  } catch (err) {
    toast('전송 실패: ' + err.message);
    btn.disabled = false;
    btn.textContent = '코멘트 전송';
  }
}

// ============================================================
// 선생님: 리포트 생성
// ============================================================
async function loadReportScreen() {
  show('teacher-report');

  const { data: myStudents } = await supabase
    .from('students')
    .select('id, profiles(name)')
    .eq('teacher_id', currentUser.id);

  const selectEl = document.getElementById('report-student-select');
  selectEl.innerHTML = `
    <option value="">학생 선택...</option>
    ${(myStudents ?? []).map(s =>
      `<option value="${escapeHtml(s.id)}">${escapeHtml(s.profiles?.name ?? '학생')}</option>`
    ).join('')}`;

  const now      = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today    = now.toISOString().slice(0, 10);
  document.getElementById('report-start').value = firstDay;
  document.getElementById('report-end').value   = today;
}

async function generateReport() {
  const studentId = document.getElementById('report-student-select').value;
  const startDate = document.getElementById('report-start').value;
  const endDate   = document.getElementById('report-end').value;
  const includeContent = document.getElementById('include-content').checked;
  const includeComment = document.getElementById('include-comment').checked;
  const includeImages  = document.getElementById('include-images').checked;

  if (!studentId) { toast('학생을 선택해주세요.'); return; }
  if (!startDate || !endDate) { toast('기간을 설정해주세요.'); return; }
  if (startDate > endDate) { toast('시작일이 종료일보다 늦습니다.'); return; }

  const btn = document.getElementById('generate-report-btn');
  btn.disabled = true;
  btn.textContent = '데이터 조회 중...';

  try {
    const { data: logs, error } = await supabase
      .from('study_logs')
      .select('*, comments(*, profiles(name))')
      .eq('student_id', studentId)
      .gte('logged_at', startDate)
      .lte('logged_at', endDate)
      .order('logged_at', { ascending: true });

    if (error) throw error;

    const { data: studentProfile } = await supabase
      .from('profiles').select('name').eq('id', studentId).single();

    btn.textContent = 'PDF 생성 중...';

    printReport({
      studentName:    studentProfile?.name ?? '학생',
      teacherName:    currentProfile?.name ?? '선생님',
      startDate,
      endDate,
      logs:           logs ?? [],
      includeContent,
      includeComment,
      includeImages,
    });

    toast('리포트 창이 열렸습니다. 인쇄(Ctrl+P)로 PDF 저장하세요.');
  } catch (err) {
    toast('생성 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'PDF 리포트 생성';
  }
}

function printReport({ studentName, teacherName, startDate, endDate, logs, includeContent, includeComment, includeImages }) {
  const logsHtml = logs.length === 0
    ? '<p style="color:#888;text-align:center;padding:40px 0;">해당 기간에 기록이 없습니다.</p>'
    : logs.map(log => {
        const commentHtml = (includeComment && log.comments && log.comments.length > 0)
          ? `<div style="margin-top:10px;padding:10px 14px;background:#EFF6FF;border-radius:8px;border-left:3px solid #3B82F6;">
               <div style="font-size:11px;font-weight:700;color:#1D4ED8;margin-bottom:4px;">
                 💬 ${escapeHtml(log.comments[0].profiles?.name ?? '선생님')} 코멘트
               </div>
               <div style="font-size:12px;color:#374151;line-height:1.6;">${escapeHtml(log.comments[0].content)}</div>
               <div style="font-size:10px;color:#9CA3AF;margin-top:4px;">${escapeHtml(formatDateTime(log.comments[0].created_at))}</div>
             </div>`
          : '';

        const imagesHtml = (includeImages && log.image_urls && log.image_urls.length > 0)
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
               ${log.image_urls.map(url =>
                 `<img src="${escapeHtml(url)}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1px solid #E5E7EB;" />`
               ).join('')}
             </div>`
          : '';

        const contentHtml = includeContent
          ? `<div style="font-size:13px;color:#374151;line-height:1.7;margin-top:8px;">${escapeHtml(log.content)}</div>`
          : '';

        return `
          <div style="margin-bottom:20px;padding:16px;border:1px solid #E5E7EB;border-radius:10px;page-break-inside:avoid;">
            <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:4px;">
              📅 ${escapeHtml(formatDate(log.logged_at))} (${escapeHtml(daysAgo(log.logged_at))})
            </div>
            ${contentHtml}
            ${imagesHtml}
            ${commentHtml}
          </div>`;
      }).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>학습 리포트 - ${escapeHtml(studentName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;
      font-size: 13px;
      color: #111827;
      background: white;
      padding: 40px;
      max-width: 700px;
      margin: 0 auto;
    }
    @media print {
      body { padding: 20px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <!-- 표지 -->
  <div style="text-align:center;padding:32px 0;border-bottom:2px solid #111827;margin-bottom:28px;">
    <div style="font-size:28px;margin-bottom:8px;">📚</div>
    <h1 style="font-size:22px;font-weight:700;letter-spacing:-0.5px;">학습 다이어리 리포트</h1>
    <div style="margin-top:12px;display:flex;justify-content:center;gap:24px;font-size:13px;color:#6B7280;">
      <span>학생: <strong style="color:#111827;">${escapeHtml(studentName)}</strong></span>
      <span>담당: <strong style="color:#111827;">${escapeHtml(teacherName)}</strong></span>
    </div>
    <div style="margin-top:6px;font-size:12px;color:#9CA3AF;">
      기간: ${escapeHtml(startDate)} ~ ${escapeHtml(endDate)} &nbsp;|&nbsp; 총 ${logs.length}개 기록
    </div>
  </div>

  <!-- 기록 목록 -->
  <div>
    ${logsHtml}
  </div>

  <!-- 하단 -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #E5E7EB;text-align:center;font-size:11px;color:#9CA3AF;">
    생성일: ${new Date().toLocaleDateString('ko-KR')} &nbsp;|&nbsp; 기숙사 학습 다이어리
  </div>

  <div style="margin-top:20px;text-align:center;">
    <button onclick="window.print()"
            style="padding:10px 24px;background:#111827;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;">
      🖨️ PDF로 저장 (Ctrl+P)
    </button>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ============================================================
// 전역 노출 (인라인 onclick에서 호출)
// ============================================================
window.login             = login;
window.logout            = logout;
window.loadStudentHome   = loadStudentHome;
window.showStudentWrite  = showStudentWrite;
window.previewImages     = previewImages;
window.submitLog         = submitLog;
window.loadStudentDetail = loadStudentDetail;
window.openImage         = openImage;
window.closeImageOverlay = closeImageOverlay;
window.loadTeacherFeed   = loadTeacherFeed;
window.loadTeacherDetail = loadTeacherDetail;
window.submitComment     = submitComment;
window.loadReportScreen  = loadReportScreen;
window.generateReport    = generateReport;

// 앱 시작
init();
