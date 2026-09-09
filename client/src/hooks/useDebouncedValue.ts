import { useEffect, useState } from "react";

/**
 * يرجّع نسخة من `value` بتتحدّث بعد `delayMs` من آخر تغيير — مستخدمة في كل خانات
 * البحث في البرنامج عشان الفلترة تبقى فورية (كل حرف) من غير ما نضرب السيرفر بطلب
 * مع كل ضغطة زرار. لو المستخدم مسكمل في الكتابة، القيمة القديمة بتفضل زي ما هي
 * لحد ما يستقر لـ delayMs.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
