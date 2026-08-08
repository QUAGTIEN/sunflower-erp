import { authService, type UserProfile } from './firebaseService';

type UserRole = UserProfile['role'];

interface ManagedUserFields {
  displayName: string;
  role: UserRole;
  active: boolean;
  allowedPages: string[];
}

interface CreateManagedUserInput extends ManagedUserFields {
  email: string;
  password: string;
}

interface UpdateManagedUserInput extends ManagedUserFields {
  uid: string;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

const postAdminRequest = async <T>(path: string, body: unknown): Promise<T> => {
  const token = await authService.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  let payload: ApiErrorPayload & T;
  try {
    payload = await response.json() as ApiErrorPayload & T;
  } catch {
    throw new Error('API quản trị không trả về dữ liệu JSON hợp lệ. Hãy kiểm tra cấu hình Vercel Functions.');
  }
  if (!response.ok) {
    throw new Error(payload.error || `API quản trị trả về lỗi HTTP ${response.status}.`);
  }
  return payload;
};

export const adminUserService = {
  create(input: CreateManagedUserInput): Promise<UserProfile> {
    return postAdminRequest<{ user: UserProfile }>('/api/users/create', input)
      .then(result => result.user);
  },

  update(input: UpdateManagedUserInput): Promise<UserProfile> {
    return postAdminRequest<{ user: UserProfile }>('/api/users/update', input)
      .then(result => result.user);
  },

  setActive(uid: string, active: boolean): Promise<{ uid: string; active: boolean }> {
    return postAdminRequest('/api/users/set-active', { uid, active });
  },

  delete(uid: string): Promise<{ uid: string }> {
    return postAdminRequest('/api/users/delete', { uid });
  }
};
