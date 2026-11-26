# MemeP3

Editor de figurinhas que roda no navegador, em Next.js e TypeScript. A interface segue o [Figma do MemeP3](https://www.figma.com/design/WKxiDUIB4OApWJkoQd0gTw/memep3?node-id=0-1) e usa os assets preparados em `public/`.

## Executar

Requer Node.js 22 ou superior.

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. Use HTTPS em produção para permitir microfone, compartilhamento e acesso às APIs de mídia. `npm run build:web` gera os arquivos estáticos em `out/`. Eles podem ser hospedados sem servidor Next.js.

## Criar e compartilhar

1. Selecione, cole ou arraste uma imagem, um GIF ou um vídeo. São aceitos PNG, JPG, WebP, GIF, MP4, MOV e WebM, conforme os codecs do navegador. Imagens e animações têm limite de 25 MB, vídeos de 250 MB.
2. Para vídeos, escolha um trecho de até 10 segundos com os controles da timeline ou os campos de início e fim. O editor lê o trecho escolhido para a exportação.
3. Mantenha o áudio original de um vídeo compatível, envie um arquivo de áudio, grave pelo microfone ou selecione **Sem áudio**. O recorte de áudio pode ser posicionado dentro da animação.
4. Reproduza a prévia, gere o resultado e escolha o formato para baixar ou compartilhar.

O botão **Compartilhar** no cabeçalho envia o link da página. No resultado, **Baixar** salva o WebP por padrão. Quando também há uma versão em vídeo, escolha o formato na prévia. Para MP4 com áudio, a janela de salvar sugere a pasta de vídeos quando o navegador oferece esse recurso.

**Enviar ao bot** baixa o vídeo com áudio e abre o [figurinhas.live](https://figurinhas.live/) em outra aba. Envie o vídeo exportado ao serviço para receber a figurinha sonora no grupo de entregas do WhatsApp. Para um resultado sem áudio, a ação abre o compartilhamento do dispositivo para a conversa privada do [Felku](https://felku.com.br/felku/bot-de-figurinhas). Em navegadores sem compartilhamento de arquivos, a ação abre a conversa do Felku para você anexar o arquivo de **Baixar**.

O compartilhamento de vídeo com o Felku inclui o endereço do MemeP3 na descrição. Defina `NEXT_PUBLIC_MEMEP3_URL` antes do build para usar um domínio diferente de `memep3.vercel.app`.

- **WebP de figurinha** tem 512 × 512 px e até 100 KB para imagens estáticas, ou 500 KB e 10 segundos para animações. O arquivo fica sem áudio e segue os limites públicos das [figurinhas do WhatsApp](https://github.com/WhatsApp/stickers/blob/main/Android/README.md).
- **Vídeo com áudio** sai em MP4 quando há suporte a H.264 e AAC, ou WebM quando há suporte a VP8/VP9 e Opus. A importação como figurinha depende das opções disponíveis no WhatsApp. A geração de figurinhas sonoras nativas exige uma interface pública que o WhatsApp ainda não documenta para sites.

O editor processa e exporta os arquivos no dispositivo. A conversão pelo bot começa quando você envia o arquivo ao serviço escolhido. O editor usa Web Audio para recorte e prévia, Mediabunny para leitura e escrita de mídia e gifuct-js para compor quadros GIF. Quando o navegador não oferece codificação nativa em WebP ou AAC, o editor carrega os codecs WebAssembly locais sob demanda. O navegador só solicita acesso ao microfone ao iniciar uma gravação.

## Extensão

```bash
npm run build:extension
```

Em `chrome://extensions` ou `edge://extensions`, ative o modo do desenvolvedor e carregue a pasta `dist/extension`. A extensão abre o mesmo editor em uma aba. O campo adicional do MyInstants baixa um áudio apenas quando o usuário solicita.

## Testes

```bash
npm test
npm run typecheck
npm run build
```
