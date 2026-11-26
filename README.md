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

Para resultados com áudio, **Salvar no WhatsApp** salva o vídeo para seleção em **Figurinhas → Criar** no WhatsApp. Manter a faixa sonora depende da disponibilidade do botão de som no editor do WhatsApp.

### Adicionar um pacote sem áudio ao WhatsApp

1. Gere uma figurinha sem áudio e escolha **Salvar no WhatsApp** na tela de resultado. Repita para reunir de 3 a 30 figurinhas. O WhatsApp exige pacotes separados para estáticas e animadas.
2. Dê um nome ao pacote, escolha **Preparar pacote** e baixe o arquivo `.memep3pack`. Mantenha a página aberta enquanto monta o pacote.
3. Com o app complementar instalado no celular, use **Abrir app MemeP3** e selecione o arquivo em **Importar pacote**.
4. No app MemeP3, toque em **Adicionar ao WhatsApp** e confirme no WhatsApp. As figurinhas ficam disponíveis na bandeja de figurinhas da conversa.

O site monta o pacote localmente. O importador usa a integração oficial de pacotes do [Android](https://github.com/WhatsApp/stickers/blob/main/Android/README.md) e do [iOS](https://github.com/WhatsApp/stickers/blob/main/iOS/README.md).

- **Android**. Abra `mobile/android` no Android Studio com SDK 36 e JDK 17 ou 21. Para um APK local, execute `gradle :app:assembleDebug` em `mobile/android`. O arquivo sai em `app/build/outputs/apk/debug/app-debug.apk`.
- **iPhone**. Em um Mac com Xcode e XcodeGen, execute `xcodegen generate` em `mobile/ios`, abra `MemeP3.xcodeproj`, selecione sua equipe de assinatura e rode no aparelho com WhatsApp instalado.

- **WebP de figurinha** tem 512 × 512 px e até 100 KB para imagens estáticas, ou 500 KB e 10 segundos para animações. O arquivo fica sem áudio e segue os limites públicos das [figurinhas do WhatsApp](https://github.com/WhatsApp/stickers/blob/main/Android/README.md).
- **Vídeo com áudio** sai em MP4 quando há suporte a H.264 e AAC, ou WebM quando há suporte a VP8/VP9 e Opus. A importação como figurinha depende das opções disponíveis no WhatsApp. A geração de figurinhas sonoras nativas exige uma interface pública que o WhatsApp ainda não documenta para sites.

O editor processa e exporta os arquivos no dispositivo. O editor usa Web Audio para recorte e prévia, Mediabunny para leitura e escrita de mídia e gifuct-js para compor quadros GIF. Quando o navegador não oferece codificação nativa em WebP ou AAC, o editor carrega os codecs WebAssembly locais sob demanda. O navegador só solicita acesso ao microfone ao iniciar uma gravação.

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
