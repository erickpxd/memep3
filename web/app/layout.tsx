import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../shared/editor/ui/studio.css";

export const metadata: Metadata = {
  title: "MemeP3 — Crie figurinhas para o WhatsApp",
  description: "Combine uma imagem com um trecho de áudio e prepare uma figurinha para o WhatsApp.",
  icons: "/favicon.png",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
