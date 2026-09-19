import { devicesApi } from '../api/companion';
import { api } from '../api/client';
import { androidCall, isAndroidCompanion, type PhoneRegistration } from './android';
import { connection } from '../localConnection';

// Shared across StrictMode's effect replay. Register once per verified identity.
export let registration: { profile: string; promise: Promise<void> } | null = null;
export async function register(profile: string) {
  if (connection.kind !== 'cloud') throw new Error('Phone registration uses the cloud account.');
  const stored = await androidCall<PhoneRegistration | null>('registration');
  if (stored) {
    if (stored.profile_uuid !== profile) throw new Error('Sign out before linking a different account.');
    const devices = await devicesApi.list();
    if (!devices.some((d) => d.uuid === stored.device_uuid)) {
      throw new Error('This phone was removed. Sign out and sign in again to link it.');
    }
    return;
  }
  const { code } = await devicesApi.pairingCode('Athena Android', 'android');
  const paired = await api.post<PhoneRegistration & { device_token: string }>('/api/v1/devices/pair', {
    code, name: 'Athena Android', platform: 'android',
  });
  try {
    if (paired.profile_uuid !== profile) throw new Error('Phone identity did not match.');
    await androidCall('saveRegistration', paired);
  } catch (error) {
    // Do not leave an unusable registration behind if secure storage failed.
    await devicesApi.revoke(paired.device_uuid).catch(() => undefined);
    throw error;
  }
}

export async function unlinkAndroidPhone() {
  if (!isAndroidCompanion()) return;
  // Wait for any in-flight registration before signing out or changing identity.
  await registration?.promise.catch(() => undefined);
  const stored = await androidCall<PhoneRegistration | null>('registration');
  if (stored) await devicesApi.revoke(stored.device_uuid).catch((error) => {
    if (error?.status !== 404) throw error;
  });
  await androidCall('signOut');
  registration = null;
}

export function beginRegistration(profile: string) {
  if (!registration || registration.profile !== profile) registration = { profile, promise: register(profile) };
  return registration;
}
export function clearFailedRegistration(current: typeof registration) {
  if (registration === current) registration = null;
}
