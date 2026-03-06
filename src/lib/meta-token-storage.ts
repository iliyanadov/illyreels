import { cookies } from 'next/headers';

// ===== New Multi-Account Types =====

export interface StoredAccount {
  userAccessToken: string;
  igUserId?: string;
  igUsername?: string;
  expiresAt: number;
}

export interface StoredTokenData {
  accounts: StoredAccount[];
  activeIndex: number;
}

// ===== Legacy Type (for migration) =====

interface LegacyStoredToken {
  userAccessToken: string;
  igUserId?: string;
  igUsername?: string;
  expiresAt?: number;
}

// ===== Internal helpers =====

const COOKIE_NAME = 'meta_token';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days in seconds

/**
 * Check if parsed data is in the old legacy format
 */
function isLegacyFormat(data: any): data is LegacyStoredToken {
  return data && typeof data === 'object' && 'userAccessToken' in data && !('accounts' in data);
}

/**
 * Encode data for storage in cookie (base64 encode)
 */
function encode(data: StoredTokenData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64');
}

/**
 * Decode data from cookie
 */
function decode(encoded: string): StoredTokenData | LegacyStoredToken {
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    console.error('[MetaTokenStorage] Failed to decode token:', error);
    throw new Error('Invalid token data');
  }
}

/**
 * Get raw token data from cookie (handles migration)
 */
async function getRawTokenData(): Promise<StoredTokenData | null> {
  try {
    const cookieStore = await cookies();
    const encoded = cookieStore.get(COOKIE_NAME)?.value;

    if (!encoded) {
      return null;
    }

    const parsed = decode(encoded);

    // Migration: Check if old format and migrate to new format
    if (isLegacyFormat(parsed)) {
      console.log('[MetaTokenStorage] Migrating from old token format to multi-account');
      const migrated: StoredTokenData = {
        accounts: [{
          userAccessToken: parsed.userAccessToken,
          igUserId: parsed.igUserId || '',
          igUsername: parsed.igUsername || '',
          expiresAt: parsed.expiresAt || 0,
        }],
        activeIndex: 0,
      };
      // Save migrated format back to cookie
      await setMetaTokenRaw(migrated);
      return migrated;
    }

    // Validate new format
    if (!parsed.accounts || !Array.isArray(parsed.accounts)) {
      console.error('[MetaTokenStorage] Invalid token format');
      await clearMetaToken();
      return null;
    }

    return parsed as StoredTokenData;
  } catch (error) {
    console.error('[MetaTokenStorage] Error getting token:', error);
    return null;
  }
}

/**
 * Set raw token data to cookie (internal use)
 */
async function setMetaTokenRaw(data: StoredTokenData): Promise<void> {
  const cookieStore = await cookies();

  const encoded = encode(data);

  // Find the latest expiration date among all accounts
  const latestExpiry = data.accounts.reduce((max, account) => {
    return account.expiresAt > max ? account.expiresAt : max;
  }, 0);

  const expiresAt = latestExpiry > 0
    ? new Date(latestExpiry * 1000)
    : new Date(Date.now() + MAX_AGE * 1000);

  cookieStore.set({
    name: COOKIE_NAME,
    value: encoded,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  console.log('[MetaTokenStorage] Token data stored in cookie');
}

/**
 * Clean up expired accounts from the list
 */
async function cleanupExpiredAccounts(data: StoredTokenData): Promise<StoredTokenData> {
  const now = Date.now();
  const validAccounts = data.accounts.filter(account => {
    if (!account.expiresAt) return true;
    return account.expiresAt * 1000 > now;
  });

  if (validAccounts.length === 0) {
    await clearMetaToken();
    return { accounts: [], activeIndex: 0 };
  }

  // Adjust activeIndex if needed
  let newActiveIndex = data.activeIndex;
  if (newActiveIndex >= validAccounts.length) {
    newActiveIndex = 0;
  }

  return {
    accounts: validAccounts,
    activeIndex: newActiveIndex,
  };
}

// ===== Public API =====

/**
 * Get the active Instagram account token
 * Returns null if no accounts or active account is expired
 */
export async function getMetaToken(): Promise<StoredAccount | null> {
  try {
    const data = await getRawTokenData();

    if (!data || data.accounts.length === 0) {
      return null;
    }

    // Clean up expired accounts
    const cleanedData = await cleanupExpiredAccounts(data);

    if (cleanedData.accounts.length === 0) {
      return null;
    }

    const activeAccount = cleanedData.accounts[cleanedData.activeIndex];
    return activeAccount;
  } catch (error) {
    console.error('[MetaTokenStorage] Error getting token:', error);
    return null;
  }
}

/**
 * Add or update an Instagram account
 * - If igUserId already exists, update that account's token
 * - If new, add to array and set as active
 */
export async function setMetaToken(account: StoredAccount): Promise<void> {
  const data = await getRawTokenData();

  if (!data) {
    // First account
    await setMetaTokenRaw({
      accounts: [account],
      activeIndex: 0,
    });
    console.log('[MetaTokenStorage] Added first account:', account.igUsername);
    return;
  }

  // Check if this account already exists
  const existingIndex = data.accounts.findIndex(a => a.igUserId === account.igUserId);

  if (existingIndex >= 0) {
    // Update existing account
    data.accounts[existingIndex] = account;
    data.activeIndex = existingIndex;
    console.log('[MetaTokenStorage] Updated existing account:', account.igUsername);
  } else {
    // Add new account
    data.accounts.push(account);
    data.activeIndex = data.accounts.length - 1;
    console.log('[MetaTokenStorage] Added new account:', account.igUsername);
  }

  await setMetaTokenRaw(data);
}

/**
 * Update specific fields on the active account
 * Used by /api/meta/me to store igUserId after connection
 */
export async function updateMetaToken(updates: Partial<StoredAccount>): Promise<void> {
  const data = await getRawTokenData();

  if (!data || data.accounts.length === 0) {
    throw new Error('No account found to update');
  }

  // Update the active account
  data.accounts[data.activeIndex] = {
    ...data.accounts[data.activeIndex],
    ...updates,
  };

  await setMetaTokenRaw(data);
}

/**
 * Clear all Instagram accounts from cookie
 */
export async function clearMetaToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  console.log('[MetaTokenStorage] All accounts cleared from cookie');
}

/**
 * Check if user has at least one valid Instagram account
 */
export async function hasMetaToken(): Promise<boolean> {
  const token = await getMetaToken();
  return token !== null;
}

/**
 * Get the Instagram User ID from the active account
 */
export async function getIgUserId(): Promise<string | null> {
  const token = await getMetaToken();
  return token?.igUserId || null;
}

/**
 * Get the Instagram User Access Token from the active account
 */
export async function getIgAccessToken(): Promise<string | null> {
  const token = await getMetaToken();
  return token?.userAccessToken || null;
}

/**
 * Get the Instagram Username from the active account
 */
export async function getIgUsername(): Promise<string | null> {
  const token = await getMetaToken();
  return token?.igUsername || null;
}

/**
 * Get all connected accounts (without access tokens)
 * Returns array for the account switcher UI
 */
export async function getAllAccounts(): Promise<Array<{ igUserId: string | undefined; igUsername: string | undefined; isActive: boolean }>> {
  const data = await getRawTokenData();

  if (!data || data.accounts.length === 0) {
    return [];
  }

  // Clean up expired accounts first
  const cleanedData = await cleanupExpiredAccounts(data);

  return cleanedData.accounts.map((account, index) => ({
    igUserId: account.igUserId,
    igUsername: account.igUsername,
    isActive: index === cleanedData.activeIndex,
  }));
}

/**
 * Set the active account by igUserId
 * Returns true if found, false if not
 */
export async function setActiveAccount(igUserId: string): Promise<boolean> {
  const data = await getRawTokenData();

  if (!data || data.accounts.length === 0) {
    return false;
  }

  const index = data.accounts.findIndex(a => a.igUserId === igUserId);

  if (index < 0) {
    return false;
  }

  data.activeIndex = index;
  await setMetaTokenRaw(data);
  console.log('[MetaTokenStorage] Switched active account to:', data.accounts[index].igUsername);
  return true;
}

/**
 * Remove a specific account by igUserId
 * If it was the active account, set activeIndex to 0
 * If no accounts remain, clear the cookie entirely
 */
export async function removeAccount(igUserId: string): Promise<void> {
  const data = await getRawTokenData();

  if (!data || data.accounts.length === 0) {
    return;
  }

  const wasActive = data.accounts[data.activeIndex]?.igUserId === igUserId;
  const indexToRemove = data.accounts.findIndex(a => a.igUserId === igUserId);

  if (indexToRemove < 0) {
    return; // Account not found, nothing to do
  }

  // Remove the account
  data.accounts.splice(indexToRemove, 1);

  // Handle activeIndex
  if (data.accounts.length === 0) {
    // No accounts left, clear cookie
    await clearMetaToken();
    return;
  }

  if (wasActive) {
    // Removed the active account, set to first remaining
    data.activeIndex = 0;
  } else if (data.activeIndex > indexToRemove) {
    // Adjust activeIndex if we removed an account before it
    data.activeIndex--;
  }

  await setMetaTokenRaw(data);
  console.log('[MetaTokenStorage] Removed account, remaining:', data.accounts.length);
}
