'use client'

/**
 * @module store.ts
 * @description mod-ui Zustand Store —— Toast 通知状态管理
 * @mod mod-ui
 */

import { create, } from 'zustand'

import type { ToastItem, } from './components/molecules/Toast'

interface ToastStore {
  toasts: ToastItem[]
  addToast: (type: ToastItem['type'], message: string, duration?: number) => void
  dismissToast: (id: string) => void,
}

export const useToastStore = create<ToastStore>((set,) => ({
  toasts: [],
  addToast: (type, message, duration = 3000,) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36,).slice(2, 6,)}`
    set((state,) => ({
      toasts: [...state.toasts.slice(-2,), { id, type, message, duration, },],
    }),)
    setTimeout(() => {
      set((state,) => ({ toasts: state.toasts.filter((t,) => t.id !== id,), }),)
    }, duration,)
  },
  dismissToast: (id,) => set((state,) => ({ toasts: state.toasts.filter((t,) => t.id !== id,), }),),
}),)
