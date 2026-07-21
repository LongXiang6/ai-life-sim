'use client'

import { create } from 'zustand'

import type { AccountProfile, AccountSessionPayload } from './account-contract'

export type AccountSyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface AccountClientState {
  status: 'loading' | 'guest' | 'authenticated'
  account: AccountProfile | null
  revision: number
  saveApiKey: boolean
  syncStatus: AccountSyncStatus
  syncError: string | null
  acceptSession: (payload: AccountSessionPayload) => void
  setGuest: () => void
  setSaveApiKey: (save: boolean) => void
  setSyncState: (status: AccountSyncStatus, error?: string | null) => void
  setRevision: (revision: number) => void
}

export const useAccountClientStore = create<AccountClientState>((set) => ({
  status: 'loading',
  account: null,
  revision: 0,
  saveApiKey: false,
  syncStatus: 'idle',
  syncError: null,
  acceptSession: (payload) => set({
    status: 'authenticated',
    account: payload.account,
    revision: payload.snapshot.revision,
    saveApiKey: payload.snapshot.saveApiKey,
    syncStatus: 'synced',
    syncError: null,
  }),
  setGuest: () => set({
    status: 'guest',
    account: null,
    revision: 0,
    saveApiKey: false,
    syncStatus: 'idle',
    syncError: null,
  }),
  setSaveApiKey: (saveApiKey) => set({ saveApiKey }),
  setSyncState: (syncStatus, syncError = null) => set({ syncStatus, syncError }),
  setRevision: (revision) => set({ revision }),
}))
