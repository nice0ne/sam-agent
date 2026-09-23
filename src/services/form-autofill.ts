/**
 * Encrypted Profile Vault & Smart Form Auto-Filler Service for SAM-Agent
 *
 * Stores user profile identities (full name, email, phone, shipping address,
 * job title, company, bio, notes) safely encrypted on-device using Web Crypto
 * AES-GCM 256-bit without transmitting any personal data to remote servers.
 *
 * Includes heuristic semantic form inspection to automatically match input fields
 * across complex multi-step forms based on autocomplete attributes, field names,
 * placeholders, and aria-labels.
 */

export interface UserProfileData {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
  website?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  bio?: string;
  customFields?: Record<string, string>;
}

export interface EncryptedVaultPayload {
  version: 1;
  iv: string; // base64
  salt: string; // base64
  ciphertext: string; // base64
  updatedAt: number;
}

export const PROFILE_VAULT_STORAGE_KEY = 'sam_encrypted_profile_vault';

// Default machine-local key derivation salt when user has not set a custom PIN
const DEFAULT_VAULT_SALT = 'sam-agent-vault-salt-2026';

/**
 * Derive an AES-GCM 256-bit CryptoKey from a passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt user profile data with AES-GCM
 */
export async function encryptProfileVault(
  profile: UserProfileData,
  passphrase = DEFAULT_VAULT_SALT
): Promise<EncryptedVaultPayload> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const plainTextBytes = enc.encode(JSON.stringify(profile));
  const cipherBytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainTextBytes
  );

  const toB64 = (buf: Uint8Array) => btoa(String.fromCharCode(...buf));

  const payload: EncryptedVaultPayload = {
    version: 1,
    iv: toB64(iv),
    salt: toB64(salt),
    ciphertext: toB64(new Uint8Array(cipherBytes)),
    updatedAt: Date.now(),
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [PROFILE_VAULT_STORAGE_KEY]: payload });
  }

  return payload;
}

/**
 * Decrypt user profile data from storage
 */
export async function decryptProfileVault(
  passphrase = DEFAULT_VAULT_SALT
): Promise<UserProfileData | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  const res = await chrome.storage.local.get(PROFILE_VAULT_STORAGE_KEY);
  const payload: EncryptedVaultPayload = res[PROFILE_VAULT_STORAGE_KEY];
  if (!payload || !payload.ciphertext) {
    return null;
  }

  try {
    const fromB64 = (str: string) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
    const iv = fromB64(payload.iv);
    const salt = fromB64(payload.salt);
    const cipherBytes = fromB64(payload.ciphertext);

    const key = await deriveKey(passphrase, salt);
    const plainBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBytes)) as UserProfileData;
  } catch (err) {
    console.warn('[ProfileVault] Decryption failed (invalid passphrase/corrupt):', err);
    return null;
  }
}

/**
 * Semantic form matcher function injected into page context to automatically
 * detect form fields and populate them with profile values
 */
export function inPageFormAutoFiller(profile: UserProfileData): {
  filledFields: Array<{ selector: string; fieldName: string; value: string }>;
  unmatchedFields: string[];
} {
  const filledFields: Array<{ selector: string; fieldName: string; value: string }> = [];
  const unmatchedFields: string[] = [];

  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    )
  );

  const semanticMap: Array<{ key: keyof UserProfileData; regex: RegExp }> = [
    { key: 'email', regex: /(email|e-mail|mail)/i },
    { key: 'phone', regex: /(phone|tel|mobile|hp|handphone|nomor[-_]?telepon)/i },
    { key: 'firstName', regex: /(first[-_]?name|given[-_]?name|nama[-_]?depan)/i },
    { key: 'lastName', regex: /(last[-_]?name|family[-_]?name|nama[-_]?belakang|surname)/i },
    { key: 'fullName', regex: /(full[-_]?name|nama[-_]?lengkap|name|nama)/i },
    { key: 'company', regex: /(company|organization|perusahaan|kantor)/i },
    { key: 'jobTitle', regex: /(job[-_]?title|position|jabatan|pekerjaan)/i },
    { key: 'addressLine1', regex: /(address|alamat|street|address[-_]?line[-_]?1)/i },
    { key: 'city', regex: /(city|kota|kabupaten)/i },
    { key: 'stateProvince', regex: /(state|province|provinsi|wilayah)/i },
    { key: 'postalCode', regex: /(postal|zip|kodepos|kode[-_]?pos)/i },
    { key: 'country', regex: /(country|negara)/i },
    { key: 'website', regex: /(website|url|portfolio|situs)/i },
    { key: 'linkedinUrl', regex: /(linkedin)/i },
    { key: 'githubUrl', regex: /(github)/i },
    { key: 'bio', regex: /(bio|about|deskripsi|catatan|keterangan)/i },
  ];

  inputs.forEach((el) => {
    if (el.disabled || (el as any).readOnly) return;

    const id = el.id || '';
    const name = el.getAttribute('name') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const aria = el.getAttribute('aria-label') || '';

    // Search associated label
    let label = '';
    if (id) {
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) label = lbl.textContent || '';
    }
    if (!label) {
      const parentLbl = el.closest('label');
      if (parentLbl) label = parentLbl.textContent || '';
    }

    const testString = `${name} ${id} ${autocomplete} ${placeholder} ${aria} ${label}`.toLowerCase();

    let matchedKey: keyof UserProfileData | null = null;

    // Check specific autocomplete first
    if (autocomplete) {
      if (autocomplete.includes('email')) matchedKey = 'email';
      else if (autocomplete.includes('tel')) matchedKey = 'phone';
      else if (autocomplete.includes('given-name')) matchedKey = 'firstName';
      else if (autocomplete.includes('family-name')) matchedKey = 'lastName';
      else if (autocomplete.includes('name')) matchedKey = 'fullName';
      else if (autocomplete.includes('address-line1') || autocomplete.includes('street-address')) matchedKey = 'addressLine1';
      else if (autocomplete.includes('address-level2')) matchedKey = 'city';
      else if (autocomplete.includes('address-level1')) matchedKey = 'stateProvince';
      else if (autocomplete.includes('postal-code')) matchedKey = 'postalCode';
      else if (autocomplete.includes('country-name')) matchedKey = 'country';
      else if (autocomplete.includes('organization')) matchedKey = 'company';
    }

    // Heuristic match if not determined by autocomplete
    if (!matchedKey) {
      for (const rule of semanticMap) {
        if (rule.regex.test(testString)) {
          matchedKey = rule.key;
          break;
        }
      }
    }

    if (matchedKey && profile[matchedKey]) {
      const val = String(profile[matchedKey]);
      const prevVal = el.value;

      el.focus();
      el.value = val;

      // Dispatch full suite of reactive events for modern web frameworks (React, Vue, Angular)
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: val }));
      el.blur();

      const selector = id ? `#${id}` : name ? `[name="${name}"]` : placeholder ? `[placeholder*="${placeholder.slice(0, 15)}"]` : el.tagName.toLowerCase();
      filledFields.push({ selector, fieldName: String(matchedKey), value: val });
    } else {
      unmatchedFields.push(name || id || placeholder || aria || 'unknown input');
    }
  });

  return { filledFields, unmatchedFields };
}

/**
 * Executes smart auto-filling of form fields in the target tab using profile vault
 */
export async function autoFillTabForm(
  tabId: number,
  overrides?: Partial<UserProfileData>
): Promise<{
  success: boolean;
  filledFields: Array<{ selector: string; fieldName: string; value: string }>;
  unmatchedFields: string[];
  message: string;
}> {
  try {
    const vault = (await decryptProfileVault()) || {};
    const finalProfile: UserProfileData = { ...vault, ...(overrides || {}) };

    const keysWithValues = Object.keys(finalProfile).filter((k) => !!(finalProfile as any)[k]);
    if (keysWithValues.length === 0) {
      return {
        success: false,
        filledFields: [],
        unmatchedFields: [],
        message: 'Brankas profil pengguna masih kosong. Harap isi data profil di pengaturan atau berikan parameter profil.',
      };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: inPageFormAutoFiller,
      args: [finalProfile],
    });

    const data = results?.[0]?.result || { filledFields: [], unmatchedFields: [] };
    const count = data.filledFields.length;

    return {
      success: count > 0,
      filledFields: data.filledFields,
      unmatchedFields: data.unmatchedFields,
      message:
        count > 0
          ? `Berhasil mengisi ${count} kolom formulir secara otomatis berdasarkan data profil terenkripsi.`
          : 'Tidak ada kolom formulir yang cocok dengan data profil pada halaman ini.',
    };
  } catch (err: any) {
    return {
      success: false,
      filledFields: [],
      unmatchedFields: [],
      message: `Gagal melakukan auto-fill: ${err?.message || 'Script execution error'}`,
    };
  }
}
