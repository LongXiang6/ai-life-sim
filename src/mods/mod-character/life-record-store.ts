'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  ACCOUNT_MAX_SLOTS,
  CloudGameRecordSchema,
  type CloudGameRecord,
} from '@/core/account/account-contract'

interface LifeRecordStore {
  records: CloudGameRecord[]
  upsertRecord: (record: CloudGameRecord) => void
  removeRecord: (recordId: string) => void
  replaceRecords: (records: CloudGameRecord[]) => void
}

function validateRecords(records: CloudGameRecord[]): CloudGameRecord[] {
  if (records.length > ACCOUNT_MAX_SLOTS) throw new Error('战绩栏位已满，请先删除一条旧战绩')
  return records.map((record) => CloudGameRecordSchema.parse(record))
}

function recordsEqual(left: CloudGameRecord, right: CloudGameRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const useLifeRecordStore = create<LifeRecordStore>()(
  persist(
    (set, get) => ({
      records: [],
      upsertRecord: (input) => {
        const record = CloudGameRecordSchema.parse(input)
        const existingIndex = get().records.findIndex((item) => item.recordId === record.recordId)
        if (existingIndex < 0 && get().records.length >= ACCOUNT_MAX_SLOTS) {
          throw new Error('战绩栏位已满，请先删除一条旧战绩')
        }
        if (existingIndex >= 0 && recordsEqual(get().records[existingIndex]!, record)) return
        set((state) => ({
          records: existingIndex >= 0
            ? state.records.map((item) => item.recordId === record.recordId ? record : item)
            : [record, ...state.records],
        }))
      },
      removeRecord: (recordId) => set((state) => ({
        records: state.records.filter((record) => record.recordId !== recordId),
      })),
      replaceRecords: (records) => set({ records: validateRecords(records) }),
    }),
    {
      name: 'mod-character:persist:life-records',
      version: 1,
      partialize: (state) => ({ records: state.records }),
    },
  ),
)
