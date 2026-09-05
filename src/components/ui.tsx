"use client";
import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={onClose}><div className="modal-heading"><h2>{title}</h2><button aria-label="Fechar" className="icon-button" onClick={onClose}>×</button></div>{children}</dialog>;
}
export function errorMessage(error: unknown): string { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível salvar. Verifique a conexão e tente novamente.'; }
export function ErrorNotice({ message }: { message: string }) { return message ? <p className="notice error" role="alert">{message}</p> : null; }
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function shortDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); }
