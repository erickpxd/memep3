import Foundation
import ImageIO
import UniformTypeIdentifiers

struct StickerPack: Codable, Identifiable {
    struct Sticker: Codable {
        let imageData: Data
        let emojis: [String]

        enum CodingKeys: String, CodingKey {
            case imageData = "image_data"
            case emojis
        }
    }

    let format: String
    let identifier: String
    let name: String
    let publisher: String
    let animated: Bool
    let trayImage: Data
    let stickers: [Sticker]
    var id: String { identifier }

    enum CodingKeys: String, CodingKey {
        case format, identifier, name, publisher, stickers
        case animated = "animated_sticker_pack"
        case trayImage = "tray_image"
    }

    enum InvalidPack: LocalizedError {
        case data
        var errorDescription: String? { "Escolha um arquivo .memep3pack válido." }
    }

    static func read(_ url: URL) throws -> StickerPack {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        let limit = 21_000_000
        guard let data = try file.read(upToCount: limit + 1), data.count <= limit else {
            throw InvalidPack.data
        }
        let pack = try JSONDecoder().decode(Self.self, from: data)
        try pack.validate()
        return pack
    }

    func whatsappData() throws -> Data {
        let encoded = try JSONEncoder().encode(self)
        guard var payload = try JSONSerialization.jsonObject(with: encoded) as? [String: Any] else {
            throw InvalidPack.data
        }
        payload.removeValue(forKey: "format")
        payload["publisher"] = "MemeP3"
        payload["publisher_website"] = "https://memep3.vercel.app"
        return try JSONSerialization.data(withJSONObject: payload)
    }

    private func validate() throws {
        guard format == "memep3-pack-v1", identifier.hasPrefix("memep3-"),
              UUID(uuidString: String(identifier.dropFirst(7))) != nil,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.utf16.count <= 128,
              (3...30).contains(stickers.count), trayImage.count <= 50_000,
              Self.imageTypeAndSize(trayImage, type: UTType.png.identifier, side: 96) else {
            throw InvalidPack.data
        }
        for sticker in stickers {
            guard sticker.imageData.count <= (animated ? 500_000 : 100_000),
                  sticker.emojis.count <= 3 else { throw InvalidPack.data }
            try Self.validateWebP(sticker.imageData, animated: animated)
        }
    }

    private static func imageTypeAndSize(_ data: Data, type: String, side: Int) -> Bool {
        guard let image = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetType(image) as String? == type,
              let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [String: Any] else {
            return false
        }
        return properties[kCGImagePropertyPixelWidth as String] as? Int == side &&
            properties[kCGImagePropertyPixelHeight as String] as? Int == side
    }

    private static func validateWebP(_ data: Data, animated: Bool) throws {
        func tag(_ offset: Int, _ name: String) -> Bool {
            data[offset..<(offset + 4)].elementsEqual(name.utf8)
        }
        func little(_ offset: Int, _ count: Int) -> Int {
            (0..<count).reduce(0) { result, i in result | (Int(data[offset + i]) << (8 * i)) }
        }
        guard data.count >= 20, tag(0, "RIFF"), tag(8, "WEBP"), little(4, 4) == data.count - 8 else {
            throw InvalidPack.data
        }
        var offset = 12
        var frames = 0
        var duration = 0
        var dimensions: (Int, Int)?
        while offset < data.count {
            guard data.count - offset >= 8 else { throw InvalidPack.data }
            let length = little(offset + 4, 4)
            let start = offset + 8
            let end = start + length + length % 2
            guard end <= data.count else { throw InvalidPack.data }
            if tag(offset, "VP8X"), length >= 10 {
                dimensions = (little(start + 4, 3) + 1, little(start + 7, 3) + 1)
            } else if dimensions == nil, tag(offset, "VP8 "), length >= 10 {
                dimensions = (little(start + 6, 2) & 0x3fff, little(start + 8, 2) & 0x3fff)
            } else if dimensions == nil, tag(offset, "VP8L"), length >= 5 {
                let shape = little(start + 1, 4)
                dimensions = ((shape & 0x3fff) + 1, ((shape >> 14) & 0x3fff) + 1)
            }
            if tag(offset, "ANMF") {
                guard length >= 24 else { throw InvalidPack.data }
                let delay = little(start + 12, 3)
                guard delay >= 8 else { throw InvalidPack.data }
                frames += 1
                duration += delay
            }
            offset = end
        }
        guard let dimensions, dimensions == (512, 512),
              animated ? frames >= 2 && duration <= 10_000 : frames == 0 else {
            throw InvalidPack.data
        }
    }
}
