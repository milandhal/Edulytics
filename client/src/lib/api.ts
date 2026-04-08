import type { AuthUser } from '../types/auth';
import type {
  AcademicYearSummary,
  AdminDashboardData,
  COSetupData,
  BranchSummary,
  FacultyUser,
  MarksEntryStudent,
  MarksMatrixResponse,
  PagedOfferingsResponse,
  ProgramSummary,
  StudentDetail,
  StudentListResponse,
  StudentMarksResponse,
  StudentReport,
  SubjectSummary,
  TeacherDashboardData,
} from '../types/domain';

const ACCESS_TOKEN_KEY = 'edulytics_access_token';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

type RequestOptions = {
  auth?: boolean;
  retryOnAuth?: boolean;
};

type DownloadResponse = {
  blob: Blob;
  filename: string;
};

type BulkUploadResponse = {
  saved?: number;
  created?: number;
  updated?: number;
  errors: Array<{ row: number; identifier?: string; email?: string; reason: string }>;
};

type QueryParams = Record<string, string | number | boolean | null | undefined>;
type CacheEntry<T> = {
  data?: T;
  expiresAt: number;
  promise?: Promise<T>;
};

export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<AuthSession | null> | null = null;
const responseCache = new Map<string, CacheEntry<unknown>>();

function getCacheKey(path: string, params?: QueryParams) {
  return withQuery(path, params);
}

export function peekCachedGet<T>(path: string, params?: QueryParams) {
  const key = getCacheKey(path, params);
  const entry = responseCache.get(key);

  if (!entry || entry.data === undefined || entry.expiresAt <= Date.now()) {
    return undefined;
  }

  return entry.data as T;
}

export function invalidateApiCache(matcher?: string | RegExp | ((key: string) => boolean)) {
  if (!matcher) {
    responseCache.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    const matches =
      typeof matcher === 'string'
        ? key.startsWith(matcher)
        : matcher instanceof RegExp
          ? matcher.test(key)
          : matcher(key);

    if (matches) {
      responseCache.delete(key);
    }
  }
}

function buildUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE}${path}`;
}

function parseDownloadFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]).replace(/^"(.*)"$/, '$1');

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];

  return fallback;
}

function withQuery(path: string, params?: QueryParams) {
  if (!params) {
    return path;
  }

  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    query.set(key, String(value));
  });

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearStoredAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;

  if (!response.ok || !payload || !payload.success) {
    const error = payload && !payload.success
      ? payload.error
      : { code: 'HTTP_ERROR', message: response.statusText || 'Request failed' };

    throw new ApiClientError(response.status, error.code, error.message, error.details);
  }

  return payload.data;
}

async function cachedGet<T>(path: string, params?: QueryParams, ttlMs = 30_000): Promise<T> {
  const key = getCacheKey(path, params);
  const now = Date.now();
  const existing = responseCache.get(key) as CacheEntry<T> | undefined;

  if (existing?.data !== undefined && existing.expiresAt > now) {
    return existing.data;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = apiRequest<T>(key)
    .then((data) => {
      responseCache.set(key, {
        data,
        expiresAt: Date.now() + ttlMs,
      });
      return data;
    })
    .catch((error) => {
      responseCache.delete(key);
      throw error;
    });

  responseCache.set(key, {
    data: existing?.data,
    expiresAt: existing?.expiresAt ?? 0,
    promise,
  });

  return promise;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
        });
        const session = await parseEnvelope<AuthSession>(response);
        setStoredAccessToken(session.accessToken);
        return session;
      } catch (error) {
        clearStoredAccessToken();
        if (error instanceof ApiClientError) {
          return null;
        }
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const auth = options.auth ?? true;
  const retryOnAuth = options.retryOnAuth ?? auth;
  const headers = new Headers(init.headers);
  const token = auth ? getStoredAccessToken() : null;
  const hasFormData = init.body instanceof FormData;

  if (auth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!hasFormData && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    credentials: 'include',
  });

  if (auth && retryOnAuth && response.status === 401) {
    const session = await refreshAccessToken();
    if (session?.accessToken) {
      return apiRequest<T>(path, init, { ...options, retryOnAuth: false });
    }
  }

  return parseEnvelope<T>(response);
}

export async function downloadRequest(
  path: string,
  fallbackFilename: string,
  options: RequestOptions = {},
): Promise<DownloadResponse> {
  const auth = options.auth ?? true;
  const retryOnAuth = options.retryOnAuth ?? auth;
  const headers = new Headers();
  const token = auth ? getStoredAccessToken() : null;

  if (auth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (auth && retryOnAuth && response.status === 401) {
    const session = await refreshAccessToken();
    if (session?.accessToken) {
      return downloadRequest(path, fallbackFilename, { ...options, retryOnAuth: false });
    }
  }

  if (!response.ok) {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ApiEnvelope<never>) : null;
    const error = payload && !payload.success
      ? payload.error
      : { code: 'HTTP_ERROR', message: response.statusText || 'Request failed' };
    throw new ApiClientError(response.status, error.code, error.message, error.details);
  }

  return {
    blob: await response.blob(),
    filename: parseDownloadFilename(response, fallbackFilename),
  };
}

export async function loginRequest(email: string, password: string) {
  const session = await apiRequest<AuthSession>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { auth: false, retryOnAuth: false },
  );

  setStoredAccessToken(session.accessToken);
  invalidateApiCache();
  return session;
}

export async function restoreSession() {
  const storedToken = getStoredAccessToken();

  if (!storedToken) {
    return refreshAccessToken();
  }

  try {
    const user = await getMe();
    return { accessToken: storedToken, user };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return refreshAccessToken();
    }
    throw error;
  }
}

export async function getMe() {
  return apiRequest<AuthUser>('/api/v1/auth/me');
}

export async function logoutRequest() {
  try {
    await apiRequest<{ ok: true }>(
      '/api/v1/auth/logout',
      { method: 'POST' },
      { auth: false, retryOnAuth: false },
    );
  } finally {
    invalidateApiCache();
    clearStoredAccessToken();
  }
}

export async function changePasswordRequest(currentPassword: string, newPassword: string) {
  return apiRequest<{ success: true }>(
    '/api/v1/auth/change-password',
    {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
}

export async function uploadFileRequest(path: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiRequest<BulkUploadResponse>(
    path,
    {
      method: 'POST',
      body: formData,
    },
  );
  invalidateApiCache(path.replace(/\/bulk-upload$/, ''));
  return response;
}

export function getAdminDashboard() {
  return cachedGet<AdminDashboardData>('/api/v1/dashboard/admin', undefined, 60_000);
}

export function getFacultyDashboard() {
  return cachedGet<TeacherDashboardData>('/api/v1/dashboard/faculty', undefined, 60_000);
}

export function listOfferings(params?: QueryParams) {
  return cachedGet<PagedOfferingsResponse>('/api/v1/offerings', params, 45_000);
}

export function listMyOfferings(params?: QueryParams) {
  return cachedGet<PagedOfferingsResponse>('/api/v1/offerings/my', params, 45_000);
}

export function getCOSetup(offeringId: string, component: string) {
  return apiRequest<COSetupData>(`/api/v1/offerings/${offeringId}/setup/${component}`);
}

export function saveCOSetup(
  offeringId: string,
  component: string,
  payload: {
    questions: Array<{
      label: string;
      maxMarks: number;
      coId: string;
      section?: string | null;
      groupNumber?: number | null;
    }>;
  },
) {
  return apiRequest<{ success: true }>(`/api/v1/offerings/${offeringId}/setup/${component}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addCODefinition(offeringId: string, desc?: string) {
  return apiRequest<{ id: string; label: string; desc: string }>(`/api/v1/offerings/${offeringId}/cos`, {
    method: 'POST',
    body: JSON.stringify({ desc }),
  });
}

export function removeCODefinition(offeringId: string, coId: string) {
  return apiRequest<{ success: true; cascadedQuestions: number }>(`/api/v1/offerings/${offeringId}/cos/${coId}?force=true`, {
    method: 'DELETE',
  });
}

export function getOfferingStudents(offeringId: string) {
  return apiRequest<{ students: MarksEntryStudent[] }>(`/api/v1/offerings/${offeringId}/enrolled`);
}

export function getOfferingMarks(offeringId: string, component: string) {
  return apiRequest<MarksMatrixResponse>(`/api/v1/offerings/${offeringId}/marks/${component}`);
}

export function downloadOfferingSpreadsheet(offeringId: string) {
  return downloadRequest(`/api/v1/offerings/${offeringId}/export`, `offering-${offeringId}-all-sheets.xlsx`);
}

export function downloadComponentSpreadsheet(offeringId: string, component: string) {
  return downloadRequest(`/api/v1/offerings/${offeringId}/export/${component}`, `offering-${offeringId}-${component}.xlsx`);
}

export function getStudentMarks(offeringId: string, component: string, studentId: string) {
  return apiRequest<StudentMarksResponse>(`/api/v1/offerings/${offeringId}/marks/${component}/student/${studentId}`);
}

export function saveStudentMarksRequest(
  offeringId: string,
  component: string,
  studentId: string,
  payload: { marks?: Record<string, number | null>; attendanceScore?: number },
) {
  return apiRequest<{ success: true }>(`/api/v1/offerings/${offeringId}/marks/${component}/student/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function listFacultyUsers(params?: QueryParams) {
  return cachedGet<FacultyUser[]>('/api/v1/users', params, 60_000);
}

export function listPrograms() {
  return cachedGet<ProgramSummary[]>('/api/v1/programs', undefined, 60_000);
}

export function listBranches(params?: QueryParams) {
  return cachedGet<BranchSummary[]>('/api/v1/branches', params, 60_000);
}

export function listAcademicYears() {
  return cachedGet<AcademicYearSummary[]>('/api/v1/academic-years', undefined, 60_000);
}

export function listSubjects() {
  return cachedGet<SubjectSummary[]>('/api/v1/subjects', undefined, 60_000);
}

export function assignOfferingFaculty(offeringId: string, userId: string) {
  return apiRequest<{ offeringId: string; user: { id: string; name: string; email: string; department: string } }>(
    `/api/v1/offerings/${offeringId}/assign-faculty`,
    {
    method: 'POST',
    body: JSON.stringify({ userId }),
    },
  );
}

export function unassignOfferingFaculty(offeringId: string, userId: string) {
  return apiRequest<{ offeringId: string; unassignedUserId: string }>(`/api/v1/offerings/${offeringId}/assign-faculty`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

export function createUserAccount(payload: {
  name: string;
  email: string;
  department?: string | null;
  designation?: string | null;
  phone?: string | null;
  role: 'ADMIN' | 'FACULTY';
}) {
  return apiRequest<FacultyUser>('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      department: payload.department ?? null,
      designation: payload.designation ?? null,
      phone: payload.phone ?? null,
      role: payload.role,
    }),
  }).then((result) => {
    invalidateApiCache('/api/v1/users');
    invalidateApiCache('/api/v1/dashboard');
    return result;
  });
}

export function createFacultyUser(payload: {
  name: string;
  email: string;
  department?: string | null;
  designation?: string | null;
  phone?: string | null;
}) {
  return createUserAccount({ ...payload, role: 'FACULTY' });
}

export function updateFacultyUser(
  userId: string,
  payload: {
    name?: string;
    department?: string | null;
    designation?: string | null;
    phone?: string | null;
    isActive?: boolean;
  },
) {
  return apiRequest<FacultyUser>(`/api/v1/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }).then((result) => {
    invalidateApiCache('/api/v1/users');
    invalidateApiCache('/api/v1/dashboard');
    return result;
  });
}

export function resetFacultyPassword(userId: string, newPassword = '12345678') {
  return apiRequest<{ ok: true }>(`/api/v1/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ newPassword }),
  });
}

export function listStudents(params?: QueryParams) {
  return cachedGet<StudentListResponse>('/api/v1/students', params, 60_000);
}

export function getStudentDetail(studentId: string) {
  return apiRequest<StudentDetail>(`/api/v1/students/${studentId}`);
}

export function getStudentReport(studentId: string) {
  return apiRequest<StudentReport>(`/api/v1/reports/student/${studentId}`);
}

export function createProgram(payload: {
  name: string;
  type: 'UG' | 'PG';
  totalSemesters: number;
}) {
  const code = payload.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PROGRAM';

  return apiRequest<ProgramSummary>('/api/v1/programs', {
    method: 'POST',
    body: JSON.stringify({
      code,
      name: payload.name,
      type: payload.type,
      totalSemesters: payload.totalSemesters,
    }),
  }).then((result) => {
    invalidateApiCache('/api/v1/programs');
    return result;
  });
}

export function deleteProgram(programId: string) {
  return apiRequest<{ success: true }>(`/api/v1/programs/${programId}`, {
    method: 'DELETE',
  }).then((result) => {
    invalidateApiCache('/api/v1/programs');
    return result;
  });
}

export function createBranch(payload: {
  programId: string;
  code: string;
  name: string;
}) {
  return apiRequest<BranchSummary>('/api/v1/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((result) => {
    invalidateApiCache('/api/v1/branches');
    return result;
  });
}

export function deleteBranch(branchId: string) {
  return apiRequest<{ success: true }>(`/api/v1/branches/${branchId}`, {
    method: 'DELETE',
  }).then((result) => {
    invalidateApiCache('/api/v1/branches');
    return result;
  });
}

export function setActiveAcademicYear(academicYearId: string) {
  return apiRequest<AcademicYearSummary>(`/api/v1/academic-years/${academicYearId}/active`, {
    method: 'PATCH',
  }).then((result) => {
    invalidateApiCache('/api/v1/academic-years');
    invalidateApiCache('/api/v1/dashboard');
    return result;
  });
}

