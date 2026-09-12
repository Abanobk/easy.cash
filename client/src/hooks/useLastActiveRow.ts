import { useCallback, useState } from "react";

/**
 * بيفتكر آخر صف اشتغل عليه المستخدم في قائمة معيّنة — زي "الخط الغامق" في ميجا كاش اللي
 * بيوريك انت واقف فين في البرنامج. متخزّن في localStorage عشان يفضل موجود حتى لو انتقلنا
 * لصفحة تفاصيل منفصلة ورجعنا (مش حالة React بس هتتمسح وقت الـ unmount).
 *
 * `storageKey` لازم يكون مميز لكل قائمة (زي المسار الكامل بما فيه اسم الشركة) عشان
 * قوائم مختلفة ما تتصادمش على نفس المفتاح.
 */
export function useLastActiveRow(storageKey: string) {
  const readStored = useCallback(() => {
    try {
      return localStorage.getItem(`lastActiveRow:${storageKey}`);
    } catch {
      return null;
    }
  }, [storageKey]);

  const [lastActiveId, setLastActiveId] = useState<string | null>(readStored);

  const markActive = useCallback((id: string | number | null | undefined) => {
    if (id == null || id === "") return;
    const idStr = String(id);
    setLastActiveId(idStr);
    try {
      localStorage.setItem(`lastActiveRow:${storageKey}`, idStr);
    } catch {
      /* وضع تصفح خاص أو تخزين ممتلئ — تجاهل، الميزة كمالية مش أساسية */
    }
  }, [storageKey]);

  return { lastActiveId, markActive };
}
