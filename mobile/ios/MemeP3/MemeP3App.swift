import SwiftUI
import UIKit
import UniformTypeIdentifiers

@main
struct MemeP3App: App {
    var body: some Scene {
        WindowGroup { PackImporter() }
    }
}

struct PackImporter: View {
    @State private var pickingFile = false
    @State private var readingFile = false
    @State private var currentPack: StickerPack?
    @State private var status = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Abra um pacote baixado no MemeP3 e adicione as figurinhas ao WhatsApp.")
                    Button("Importar pacote") { pickingFile = true }
                        .disabled(readingFile)
                }
                if let pack = currentPack {
                    Section {
                        Label(pack.name, systemImage: "square.stack")
                        Text("\(pack.stickers.count) figurinhas").foregroundStyle(.secondary)
                        Button("Adicionar ao WhatsApp") { openWhatsApp(pack) }
                            .disabled(readingFile)
                    }
                }
                if !status.isEmpty {
                    Text(status).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("MemeP3")
            .fileImporter(isPresented: $pickingFile, allowedContentTypes: [.data]) { result in
                if case let .success(url) = result { importFile(url) }
            }
            .onOpenURL { url in
                if url.scheme == "memep3", url.host == "importar", !readingFile { pickingFile = true }
            }
        }
    }

    private func importFile(_ url: URL) {
        readingFile = true
        status = "Importando pacote…"
        Task {
            defer { readingFile = false }
            do {
                currentPack = try await Task.detached {
                    let access = url.startAccessingSecurityScopedResource()
                    defer { if access { url.stopAccessingSecurityScopedResource() } }
                    return try StickerPack.read(url)
                }.value
                status = "Pacote pronto para adicionar."
            } catch {
                status = "Não foi possível importar. Escolha um arquivo .memep3pack válido."
            }
        }
    }

    private func openWhatsApp(_ pack: StickerPack) {
        guard let url = URL(string: "whatsapp://stickerPack"), UIApplication.shared.canOpenURL(url) else {
            status = "Instale ou atualize o WhatsApp para adicionar o pacote."
            return
        }
        do {
            let data = try pack.whatsappData()
            UIPasteboard.general.setItems(
                [["net.whatsapp.third-party.sticker-pack": data]],
                options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(60)]
            )
            UIApplication.shared.open(url) { opened in
                status = opened ? "Confirme o pacote no WhatsApp." : "Não foi possível abrir o WhatsApp."
            }
        } catch {
            status = "Não foi possível preparar o pacote."
        }
    }
}
