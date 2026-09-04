import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JP Studio · Operações de conteúdo",
  description: "Torre de controle editorial da JP Studio",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
