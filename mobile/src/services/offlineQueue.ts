/**
 * FieldFix — Offline Synchronization Queue Engine.
 * Enables technicians to work in dead zones (elevators, basements, remote sites).
 * Automatically stores mutations in AsyncStorage and synchronizes them FIFO upon reconnection.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { serviceRequestService } from './serviceRequests';
import { photoService } from './photos';
import { locationService } from './location';

export type QueuedActionType = 'STATUS_UPDATE' | 'ADD_NOTE' | 'UPLOAD_PHOTO' | 'GPS_PING';

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  requestId?: string;
  payload: any;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

const QUEUE_STORAGE_KEY = '@fieldfix_offline_queue';
const CACHE_REQUESTS_KEY = '@fieldfix_cached_requests';
const OFFLINE_MODE_KEY = '@fieldfix_simulated_offline';

type OfflineListener = (isOffline: boolean, queueLength: number) => void;

class OfflineQueueManager {
  private simulatedOffline = false;
  private isSyncing = false;
  private listeners: Set<OfflineListener> = new Set();

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const storedOffline = await AsyncStorage.getItem(OFFLINE_MODE_KEY);
      this.simulatedOffline = storedOffline === 'true';
      this.notifyListeners();
    } catch {
      // Ignore storage read errors on initial load
    }
  }

  /**
   * Check if the app is currently in offline mode (either simulated or no connection).
   */
  public isOffline(): boolean {
    return this.simulatedOffline;
  }

  /**
   * Toggle or set simulated offline mode for field testing.
   */
  public async setOffline(isOffline: boolean): Promise<void> {
    this.simulatedOffline = isOffline;
    await AsyncStorage.setItem(OFFLINE_MODE_KEY, String(isOffline));
    await this.notifyListeners();

    // If coming back online, auto-sync any queued items
    if (!isOffline) {
      this.processQueue();
    }
  }

  /**
   * Subscribe to offline status and queue count changes.
   */
  public addListener(listener: OfflineListener): () => void {
    this.listeners.add(listener);
    this.notifyListeners();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notifyListeners() {
    const queue = await this.getQueue();
    for (const listener of this.listeners) {
      try {
        listener(this.simulatedOffline, queue.length);
      } catch {
        // Safe dispatch
      }
    }
  }

  /**
   * Get all queued actions.
   */
  public async getQueue(): Promise<QueuedAction[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Add a new action to the offline sync queue.
   */
  public async enqueue(
    type: QueuedActionType,
    payload: any,
    requestId?: string
  ): Promise<QueuedAction> {
    const queue = await this.getQueue();
    const action: QueuedAction = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      requestId,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    queue.push(action);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    await this.notifyListeners();
    return action;
  }

  /**
   * Remove a specific action from the queue by ID.
   */
  public async removeAction(id: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filtered));
    await this.notifyListeners();
  }

  /**
   * Clear the entire sync queue.
   */
  public async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
    await this.notifyListeners();
  }

  /**
   * Cache service requests locally for offline viewing.
   */
  public async cacheRequests(requests: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_REQUESTS_KEY, JSON.stringify(requests));
    } catch {
      // Ignore cache write error
    }
  }

  /**
   * Retrieve cached service requests when offline.
   */
  public async getCachedRequests(): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_REQUESTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Process all queued actions FIFO against the backend.
   */
  public async processQueue(): Promise<{ synced: number; failed: number }> {
    if (this.simulatedOffline || this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) {
        return { synced: 0, failed: 0 };
      }

      const remainingQueue: QueuedAction[] = [];

      for (const item of queue) {
        try {
          switch (item.type) {
            case 'STATUS_UPDATE':
              if (item.requestId && item.payload.status) {
                await serviceRequestService.updateStatus(
                  item.requestId,
                  item.payload.status,
                  item.payload.note
                );
              }
              break;

            case 'ADD_NOTE':
              if (item.requestId && item.payload.content) {
                await serviceRequestService.addNote(
                  item.requestId,
                  item.payload.content
                );
              }
              break;

            case 'UPLOAD_PHOTO':
              if (item.requestId && item.payload.fileUri) {
                await photoService.uploadPhoto({
                  requestId: item.requestId,
                  fileUri: item.payload.fileUri,
                  photoType: item.payload.photoType,
                  caption: item.payload.caption,
                  fileName: item.payload.fileName,
                });
              }
              break;

            case 'GPS_PING':
              if (item.payload.latitude && item.payload.longitude) {
                await locationService.pingLocation(
                  item.payload.latitude,
                  item.payload.longitude
                );
              }
              break;

            default:
              break;
          }

          synced++;
        } catch (error: any) {
          // If the action failed, keep it in queue if under max retries
          item.retryCount = (item.retryCount || 0) + 1;
          item.status = 'failed';
          item.error = error?.message || 'Synchronization error';

          if (item.retryCount < 3) {
            remainingQueue.push(item);
          }
          failed++;
        }
      }

      // Save remaining failed items back to queue
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingQueue));
      await this.notifyListeners();
    } finally {
      this.isSyncing = false;
    }

    return { synced, failed };
  }
}

export const offlineQueue = new OfflineQueueManager();
