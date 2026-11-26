package app.memep3.packs;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

public final class StickerProvider extends ContentProvider {
    private static final String[] METADATA = {
        "sticker_pack_identifier", "sticker_pack_name", "sticker_pack_publisher", "sticker_pack_icon",
        "android_play_store_link", "ios_app_download_link", "sticker_pack_publisher_email",
        "sticker_pack_publisher_website", "sticker_pack_privacy_policy_website", "sticker_pack_license_agreement_website",
        "image_data_version", "whatsapp_will_not_cache_stickers", "animated_sticker_pack"
    };
    private static final String[] STICKERS = {"sticker_file_name", "sticker_emoji", "sticker_accessibility_text"};

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        Context context = requireContext();
        List<String> path = uri.getPathSegments();
        if (!path.isEmpty() && path.size() <= 2 && "metadata".equals(path.get(0))) {
            MatrixCursor cursor = new MatrixCursor(METADATA);
            for (PackStore.Pack pack : PackStore.list(context)) {
                if (path.size() == 1 || pack.id().equals(path.get(1))) {
                    cursor.addRow(new Object[] {pack.id(), pack.name(), "MemeP3", PackStore.TRAY, "", "", "",
                        "https://memep3.vercel.app", "", "", "1", 0, pack.animated() ? 1 : 0});
                }
            }
            return cursor;
        }
        if (path.size() == 2 && "stickers".equals(path.get(0))) {
            MatrixCursor cursor = new MatrixCursor(STICKERS);
            try {
                PackStore.Pack pack = PackStore.read(PackStore.directory(context, path.get(1)));
                for (int i = 0; i < pack.count(); i++) cursor.addRow(new Object[] {PackStore.stickerName(i), "😀", ""});
            } catch (Exception ignored) { /* Unknown packs have no sticker rows. */ }
            return cursor;
        }
        throw new IllegalArgumentException("URI de pacote desconhecida.");
    }

    @Override public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Acesso somente para leitura.");
        List<String> path = uri.getPathSegments();
        if (path.size() != 3 || !"stickers_asset".equals(path.get(0))) throw new FileNotFoundException();
        String fileName = path.get(2);
        File folder;
        try {
            folder = PackStore.directory(requireContext(), path.get(1));
        } catch (IllegalArgumentException error) {
            throw new FileNotFoundException();
        }
        if (!PackStore.TRAY.equals(fileName) && !fileName.matches("sticker-(?:[0-9]|[12][0-9])\\.webp")) {
            throw new FileNotFoundException();
        }
        File file = new File(folder, fileName);
        return new AssetFileDescriptor(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY), 0, file.length());
    }

    @Override public String getType(Uri uri) {
        List<String> path = uri.getPathSegments();
        if (path.size() == 3 && "stickers_asset".equals(path.get(0))) {
            return PackStore.TRAY.equals(path.get(2)) ? "image/png" : "image/webp";
        }
        return path.size() == 2 && "metadata".equals(path.get(0))
            ? "vnd.android.cursor.item/vnd." + uri.getAuthority() + ".metadata"
            : "vnd.android.cursor.dir/vnd." + uri.getAuthority() + "." + (path.isEmpty() ? "metadata" : path.get(0));
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String where, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String where, String[] args) { throw new UnsupportedOperationException(); }
}
