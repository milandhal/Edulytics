export type Role = 'ADMIN' | 'FACULTY' | 'SUPER_ADMIN';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  mustChangePassword: boolean;
}
