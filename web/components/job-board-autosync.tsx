'use client';
import { useEffect } from 'react';
import { autoSyncJobBoards } from '@/app/(app)/dashboard-actions';

// Поки CRM відкрита — раз на 15 хвилин просимо сервер забрати нові відгуки з robota.ua.
// Сервер сам пропускає кабінети, які вже оновлювались нещодавно.
export function JobBoardAutoSync() {
  useEffect(() => {
    const run = () => void autoSyncJobBoards().catch(() => undefined);
    const first = setTimeout(run, 5000);
    const every = setInterval(run, 15 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return null;
}
