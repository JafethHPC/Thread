import { Injectable } from '@angular/core';

export interface StoredAuthData {
  user: any;
  token: string;
  timestamp: number;
  expiresAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private dbName = 'ThreadDB';
  private dbVersion = 1;
  private storeName = 'auth';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Error opening IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initDB();
    }
    return this.db!;
  }

  async storeAuthData(data: Omit<StoredAuthData, 'id'>): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const authData: StoredAuthData & { id: string } = {
        id: 'auth-data',
        ...data,
      };

      const request = store.put(authData);

      request.onsuccess = () => {
        console.log('Auth data stored in IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Error storing auth data:', request.error);
        reject(request.error);
      };
    });
  }

  async getAuthData(): Promise<StoredAuthData | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('auth-data');

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Check if the stored data has expired
          if (Date.now() > result.expiresAt) {
            console.log('Auth data has expired, removing it');
            this.removeAuthData().then(() => resolve(null));
            return;
          }
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('Error retrieving auth data:', request.error);
        reject(request.error);
      };
    });
  }

  async removeAuthData(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete('auth-data');

      request.onsuccess = () => {
        console.log('Auth data removed from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Error removing auth data:', request.error);
        reject(request.error);
      };
    });
  }

  async clearAllData(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('All data cleared from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Error clearing data:', request.error);
        reject(request.error);
      };
    });
  }

  // Fallback to localStorage if IndexedDB is not available
  storeAuthDataFallback(data: StoredAuthData): void {
    try {
      localStorage.setItem('thread-auth-data', JSON.stringify(data));
    } catch (error) {
      console.error('Error storing auth data in localStorage:', error);
    }
  }

  getAuthDataFallback(): StoredAuthData | null {
    try {
      const data = localStorage.getItem('thread-auth-data');
      if (data) {
        const parsed = JSON.parse(data);
        // Check if expired
        if (Date.now() > parsed.expiresAt) {
          localStorage.removeItem('thread-auth-data');
          return null;
        }
        return parsed;
      }
      return null;
    } catch (error) {
      console.error('Error retrieving auth data from localStorage:', error);
      return null;
    }
  }

  removeAuthDataFallback(): void {
    try {
      localStorage.removeItem('thread-auth-data');
    } catch (error) {
      console.error('Error removing auth data from localStorage:', error);
    }
  }
}
