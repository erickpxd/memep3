# Desenvolvimento

## Web

Requer Node.js 22 ou superior. Execute os comandos na raiz do repositório.

```sh
npm ci
npm run dev
```

O editor roda em `http://localhost:3000`. Em produção, use HTTPS para microfone, compartilhamento e APIs de mídia.

```sh
npm test
npm run typecheck
npm run build
```

`npm run build` gera o site estático em `web/out/` e a extensão em `extension/dist/`. A Vercel usa `memep3/` como raiz do projeto e executa `npm run build:web` para publicar `web/out/`. [Configuração da Vercel](../vercel.json)

## Extensão do Chrome e Edge

Execute `npm run build:extension`. Acesse `chrome://extensions` ou `edge://extensions`, ative o modo do desenvolvedor e carregue a pasta `extension/dist/`. A extensão abre o editor em uma aba. A importação de áudio do MyInstants ocorre quando você solicita.

## App Android

Abra `mobile/android/` no Android Studio com SDK 36 e JDK 17 ou 21. Os comandos abaixo geram e verificam um APK de teste.

```sh
cd mobile/android
gradle :app:assembleDebug :app:lintDebug
```

O APK é gerado em `app/build/outputs/apk/debug/app-debug.apk` dentro de `mobile/android/`. Use um celular com WhatsApp instalado para validar a confirmação do pacote.

## App iPhone

Os comandos abaixo geram o projeto do app em um Mac com Xcode e XcodeGen.

```sh
cd mobile/ios
xcodegen generate
```

Abra `MemeP3.xcodeproj`, selecione sua equipe de assinatura e rode no iPhone com WhatsApp instalado. O [workflow de iOS](../.github/workflows/ios.yml) verifica a compilação para simulador.

[Voltar ao índice](README.md)
