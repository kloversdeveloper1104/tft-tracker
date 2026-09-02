import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let seq = 1;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    const toast: Toast = { id, duration: t.duration ?? (t.kind === "error" ? 7000 : 4000), ...t };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration > 0) {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), toast.duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (title: string, message?: string) => useToast.getState().push({ kind: "info", title, message }),
  success: (title: string, message?: string) => useToast.getState().push({ kind: "success", title, message }),
  warning: (title: string, message?: string) => useToast.getState().push({ kind: "warning", title, message }),
  error: (title: string, message?: string) => useToast.getState().push({ kind: "error", title, message }),
};
