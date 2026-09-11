import { api } from './client';

export interface CompanionUser {
  email: string | null;
  full_name: string | null;
  picture: string | null;
}

export interface Profile {
  uuid: string;
  full_name?: string | null;
  email?: string | null;
  picture?: string | null;
}

/** Exchange a Google ID token for the httpOnly Companion session cookie. */
export function googleSignIn(credential: string) {
  return api.post<{ success: boolean; user: CompanionUser }>('/auth/companion/google', { credential });
}

/** The current user if the session cookie is valid, else throws 401. */
export function fetchMe() {
  return api.get<{ success: boolean; user: CompanionUser }>('/auth/companion/me');
}

export function signOut() {
  return api.post<{ success: boolean }>('/auth/companion/logout');
}

/** The caller's Athena profile — created on first call from the Google identity. */
export function fetchProfile() {
  return api.get<Profile>('/api/v1/profile');
}
