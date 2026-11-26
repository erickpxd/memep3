function cancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function shareDescription(siteUrl = process.env.NEXT_PUBLIC_MEMEP3_URL) {
  let link = "https://memep3.vercel.app";
  if (siteUrl) {
    try {
      const address = new URL(siteUrl);
      if (address.protocol === "http:" || address.protocol === "https:") {
        link = address.origin + (address.pathname === "/" ? "" : address.pathname);
      }
    } catch {
      // Keep the provisional URL when the configured address is invalid.
    }
  }
  return `Feito no MemeP3 · ${link}`;
}

export async function shareSite(url: string) {
  const address = new URL(url);
  if (!["https:", "http:"].includes(address.protocol)) throw new Error("Abra o site para compartilhar o endereço.");
  address.hash = "";
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Crie suas próprias figurinhas!",
        text: "Transforme imagens e vídeos em figurinhas para o WhatsApp.",
        url: address.href,
      });
      return "shared";
    }
  } catch (error) {
    if (cancelled(error)) return "cancelled";
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(address.href);
      return "copied";
    } catch {
      // Browsers can restrict clipboard access. Offer manual copy instead.
    }
  }
  return address.href;
}

export async function shareFile(file: File) {
  const data = { files: [file] };
  if (!navigator.share || !navigator.canShare?.(data)) return "download";
  try {
    await navigator.share({ ...data, title: "Minha criação no MemeP3", text: shareDescription() });
    return "shared";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    return "download";
  }
}
