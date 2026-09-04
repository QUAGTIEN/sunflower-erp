export type UserRole =
  | 'admin'
  | 'sale'
  | 'designer'
  | 'purchaser'
  | 'producer'
  | 'accountant';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  allowedPages?: string[];
}
