import { useCallback, useState } from "react";

/**
 * مفضلة موردين/عملاء/أصناف خاصة بشاشة "شغل المصنع اليومي" بس (localStorage محلي للمتصفح) —
 * بتخلي العناصر المفضلة تظهر فوق نتائج البحث الذكي قبل ما تكتب أي حرف، عشان تسهّل الاختيار السريع
 * على اللي بيدخل بيانات كتير بنفس الموردين/الأصناف كل يوم.
 */
export function useFactoryDailyFavorites(category: "supplier" | "customer" | "item") {
  const storageKey = `factoryDailyFavorites:${category}`;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return { favoriteIds, toggleFavorite };
}
