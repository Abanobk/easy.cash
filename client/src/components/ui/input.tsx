import { useDialogComposition } from "@/components/ui/dialog";
import { useComposition } from "@/hooks/useComposition";
import { normalizeNumericInput } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import * as React from "react";
import { DateField } from "@/components/form/DateField";

/** جسر: Input type=date → تقويم يوم/شهر/سنة */
function DateInputBridge({
  className,
  onChange,
  value,
  defaultValue,
  disabled,
  id,
  name,
  placeholder,
}: React.ComponentProps<"input">) {
  const iso = value == null ? String(defaultValue ?? "") : String(value);
  return (
    <DateField
      id={id}
      name={name}
      disabled={disabled}
      placeholder={typeof placeholder === "string" ? placeholder : "يوم/شهر/سنة"}
      className={className}
      value={iso.slice(0, 10)}
      allowTyping
      onChange={(next) => {
        onChange?.({
          target: { value: next, name: name ?? "" },
          currentTarget: { value: next, name: name ?? "" },
        } as React.ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}

function TextLikeInput({
  className,
  type,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onWheel,
  onChange,
  onPaste,
  inputMode,
  ...props
}: React.ComponentProps<"input">) {
  const dialogComposition = useDialogComposition();

  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  } = useComposition<HTMLInputElement>({
    onKeyDown: (e) => {
      const isComposing = (e.nativeEvent as any).isComposing || dialogComposition.justEndedComposing();
      if (e.key === "Enter" && isComposing) {
        return;
      }
      onKeyDown?.(e);
    },
    onCompositionStart: e => {
      dialogComposition.setComposing(true);
      onCompositionStart?.(e);
    },
    onCompositionEnd: e => {
      dialogComposition.markCompositionEnd();
      setTimeout(() => {
        dialogComposition.setComposing(false);
      }, 100);
      onCompositionEnd?.(e);
    },
  });

  return (
    <input
      type={type}
      data-slot="input"
      lang="en"
      inputMode={type === "number" ? "decimal" : inputMode}
      className={cn(
        "file:text-foreground placeholder:text-slate-400 selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-slate-300 h-10 w-full min-w-0 rounded-md border bg-white px-3 py-1 text-[15px] font-semibold text-slate-900 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        type === "number" && "tabular-nums",
        className
      )}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      {...props}
      onChange={(e) => {
        if (type === "number") {
          const western = normalizeNumericInput(e.target.value);
          if (western !== e.target.value) {
            e.target.value = western;
          }
        }
        onChange?.(e);
      }}
      onPaste={(e) => {
        if (type === "number") {
          const text = e.clipboardData.getData("text");
          const western = normalizeNumericInput(text);
          if (western !== text) {
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.value = normalizeNumericInput(el.value.slice(0, start) + western + el.value.slice(end));
            onChange?.({
              ...e,
              target: el,
              currentTarget: el,
            } as React.ChangeEvent<HTMLInputElement>);
            return;
          }
        }
        onPaste?.(e);
      }}
      onWheel={(e) => {
        if (type === "number") {
          e.currentTarget.blur();
        }
        onWheel?.(e);
      }}
    />
  );
}

function Input(props: React.ComponentProps<"input">) {
  // كل حقول التاريخ في البرنامج → تقويم بترتيب يوم/شهر/سنة
  if (props.type === "date") {
    return <DateInputBridge {...props} />;
  }
  return <TextLikeInput {...props} />;
}

export { Input };
