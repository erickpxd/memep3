# Arquitetura

| Pasta | Responsabilidade |
| --- | --- |
| [web/](../web/) | Site e configuração do Next.js. |
| [web/app/](../web/app/) | Página e layout do site. |
| [web/public/](../web/public/) | Imagens, ícones e codecs que o site serve e o build da extensão reutiliza. |
| [shared/editor/](../shared/editor/) | Fluxo do editor compartilhado entre o site e a extensão. |
| [shared/editor/ui/](../shared/editor/ui/) | Componentes de interface, prévia, enquadramento e estilos. |
| [shared/editor/media/](../shared/editor/media/) | Leitura de arquivos, animação, gravação, timeline e enquadramento. |
| [shared/editor/export/](../shared/editor/export/) | Renderização, WebP, montagem de pacotes e ações de salvar e compartilhar. |
| [extension/](../extension/) | Entradas, manifesto, build e integração MyInstants da extensão. |
| [mobile/android/](../mobile/android/) | Importação de WebP e pacotes e entrega ao WhatsApp no Android. |
| [mobile/ios/](../mobile/ios/) | Importação de pacotes e entrega ao WhatsApp no iPhone. |
| [shared/build/](../shared/build/) | Preparação de codecs usados pelos dois builds. |
| [shared/tests/](../shared/tests/) | Testes das regras do editor. |
| [wiki/](README.md) | Documentação do projeto. |

O componente Studio recebe as mídias, controla as etapas do editor e aciona a exportação. A mídia é processada no dispositivo com Web Audio para recorte e prévia, Mediabunny para leitura e escrita e gifuct-js para quadros GIF. O editor carrega os codecs WebAssembly locais sob demanda quando são necessários para WebP ou AAC. [Componente Studio](../shared/editor/studio.tsx)

O site é exportado para `web/out/`, a extensão para `extension/dist/` e o APK para `mobile/android/app/build/outputs/apk/debug/`. Essas pastas de build são geradas a partir do código. O `package.json` da raiz concentra os comandos e as dependências do JavaScript usados pelo site e pela extensão.

[Voltar ao índice](README.md)
