import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  return null;
};

export const backupDatabaseToDrive = async () => {
    let token = await getAccessToken();
    if (!token) {
        const result = await googleSignIn();
        if (!result) return false;
        token = result.accessToken;
    }

    // 1. Fetch the database blob from our server
    const res = await fetch('/api/backup/download-db', {
      headers: {
        'x-user-id': localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : ''
      }
    });
    if (!res.ok) throw new Error("Failed to download database from server.");
    const blob = await res.blob();

    // 2. Upload to Google Drive using multipart upload
    const metadata = {
        name: `gtr_pos_backup_${new Date().toISOString().split('T')[0]}.db`,
        mimeType: 'application/x-sqlite3',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: form
    });

    if (!uploadRes.ok) {
        throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
    }

    return true;
};
