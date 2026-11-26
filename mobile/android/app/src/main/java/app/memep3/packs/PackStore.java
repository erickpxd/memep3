package app.memep3.packs;

import android.content.Context;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class PackStore {
    static final String TRAY = "tray.png";
    static final int MAX_PACKS = 10;
    private static final int MAX_BYTES = 21_000_000;

    record Pack(String id, String name, boolean animated, int count) {}
    static final class CapacityException extends IOException {}

    private PackStore() {}

    static File directory(Context context, String id) {
        if (!id.matches("memep3-[a-f0-9-]{36}")) throw new IllegalArgumentException("Pacote inválido.");
        return new File(root(context), id);
    }

    static String stickerName(int index) {
        return "sticker-" + index + ".webp";
    }

    static Pack importFile(Context context, Uri uri) throws Exception {
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IOException("Não foi possível abrir o arquivo.");
            ByteArrayOutputStream content = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int size; (size = input.read(buffer)) != -1;) {
                if (content.size() + size > MAX_BYTES) throw new IOException("O pacote é grande demais.");
                content.write(buffer, 0, size);
            }
            return save(context, new JSONObject(content.toString(StandardCharsets.UTF_8.name())));
        }
    }

    private static synchronized Pack save(Context context, JSONObject data) throws Exception {
        String id = data.getString("identifier");
        File target = directory(context, id);
        String name = data.getString("name").trim();
        JSONArray stickers = data.getJSONArray("stickers");
        boolean animated = data.getBoolean("animated_sticker_pack");
        int count = stickers.length();
        if (!"memep3-pack-v1".equals(data.getString("format")) || name.isEmpty()
                || name.length() > 128 || count < 3 || count > 30) {
            throw new IOException("Escolha um pacote do MemeP3 com 3 a 30 figurinhas.");
        }
        if (target.isDirectory()) return read(target);
        if (list(context).size() >= MAX_PACKS) throw new CapacityException();

        Files.createDirectories(root(context).toPath());
        File temporary = new File(root(context), "." + UUID.randomUUID());
        Files.createDirectory(temporary.toPath());
        try {
            byte[] tray = decode(data.getString("tray_image"), 50_000);
            checkImage(tray, "image/png", 96);
            Files.write(new File(temporary, TRAY).toPath(), tray);
            for (int index = 0; index < count; index++) {
                byte[] sticker = decode(stickers.getJSONObject(index).getString("image_data"), animated ? 500_000 : 100_000);
                checkImage(sticker, "image/webp", 512);
                checkAnimation(sticker, animated);
                Files.write(new File(temporary, stickerName(index)).toPath(), sticker);
            }
            JSONObject metadata = new JSONObject().put("name", name).put("animated", animated).put("count", count);
            Files.write(new File(temporary, "meta.json").toPath(), metadata.toString().getBytes(StandardCharsets.UTF_8));
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE);
            return new Pack(id, name, animated, count);
        } finally {
            File[] files = temporary.listFiles();
            if (files != null) {
                for (File file : files) file.delete();
            }
            temporary.delete();
        }
    }

    static List<Pack> list(Context context) {
        List<Pack> packs = new ArrayList<>();
        File[] folders = root(context).listFiles(file -> file.isDirectory() && file.getName().matches("memep3-[a-f0-9-]{36}"));
        if (folders != null) {
            for (File folder : folders) {
                try { packs.add(read(folder)); }
                catch (Exception ignored) { /* A damaged local pack is left out of the list. */ }
            }
        }
        packs.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
        return packs;
    }

    static Pack read(File folder) throws Exception {
        byte[] metadata = Files.readAllBytes(new File(folder, "meta.json").toPath());
        JSONObject info = new JSONObject(new String(metadata, StandardCharsets.UTF_8));
        return new Pack(folder.getName(), info.getString("name"), info.getBoolean("animated"), info.getInt("count"));
    }

    static synchronized void remove(Context context, Pack pack) throws IOException {
        File original = directory(context, pack.id());
        if (!original.isDirectory()) return;
        File removed = new File(root(context), "." + UUID.randomUUID());
        Files.move(original.toPath(), removed.toPath(), StandardCopyOption.ATOMIC_MOVE);
        File[] files = removed.listFiles();
        if (files == null) return;
        for (File file : files) Files.deleteIfExists(file.toPath());
        Files.deleteIfExists(removed.toPath());
    }

    private static File root(Context context) {
        return new File(context.getFilesDir(), "packs");
    }

    private static byte[] decode(String text, int limit) throws IOException {
        if (text.length() > ((limit + 2) / 3) * 4) throw new IOException("Uma imagem ultrapassa o tamanho permitido.");
        byte[] data = Base64.decode(text, Base64.NO_WRAP);
        if (data.length == 0 || data.length > limit) throw new IOException("Uma imagem está fora dos limites.");
        return data;
    }

    private static void checkImage(byte[] bytes, String mime, int side) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth != side || bounds.outHeight != side || !mime.equals(bounds.outMimeType)) {
            throw new IOException("Uma imagem do pacote tem formato ou dimensões inválidas.");
        }
    }

    private static void checkAnimation(byte[] bytes, boolean animated) throws IOException {
        if (bytes.length < 20 || !tag(bytes, 0, "RIFF") || !tag(bytes, 8, "WEBP") || little(bytes, 4, 4) != bytes.length - 8) {
            throw new IOException("WebP inválido.");
        }
        int frames = 0;
        long duration = 0;
        for (int offset = 12; offset < bytes.length;) {
            if (bytes.length - offset < 8) throw new IOException("WebP incompleto.");
            long length = little(bytes, offset + 4, 4);
            long end = offset + 8L + length + length % 2;
            if (end > bytes.length) throw new IOException("WebP incompleto.");
            if (tag(bytes, offset, "ANMF")) {
                if (length < 24) throw new IOException("Quadro WebP inválido.");
                long delay = little(bytes, offset + 20, 3);
                if (delay < 8) throw new IOException("Quadro WebP muito curto.");
                duration += delay;
                frames++;
            }
            offset = (int) end;
        }
        if (animated ? frames < 2 || duration > 10_000 : frames != 0) throw new IOException("O tipo ou a duração do WebP não corresponde ao pacote.");
    }

    private static boolean tag(byte[] bytes, int offset, String text) {
        for (int index = 0; index < text.length(); index++) {
            if (bytes[offset + index] != text.charAt(index)) return false;
        }
        return true;
    }

    private static long little(byte[] bytes, int offset, int length) {
        long value = 0;
        for (int index = 0; index < length; index++) value |= (bytes[offset + index] & 255L) << (8 * index);
        return value;
    }
}
