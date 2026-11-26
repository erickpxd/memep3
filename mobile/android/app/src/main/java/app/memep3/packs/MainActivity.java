package app.memep3.packs;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int CHOOSE_PACK = 1;
    private static final int ENABLE_PACK = 2;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout packs;
    private Button importButton;
    private TextView status;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        page.setPadding(padding, padding, padding, padding);
        scroll.addView(page);
        setContentView(scroll);

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(30);
        title.setAccessibilityHeading(true);
        page.addView(title);
        TextView description = new TextView(this);
        description.setText(R.string.description);
        page.addView(description);

        importButton = new Button(this);
        importButton.setText(R.string.import_pack);
        importButton.setOnClickListener(view -> chooseFile());
        page.addView(importButton);

        status = new TextView(this);
        status.setTextColor(Color.DKGRAY);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        page.addView(status);
        packs = new LinearLayout(this);
        packs.setOrientation(LinearLayout.VERTICAL);
        page.addView(packs);
        showPacks();
        if (saved == null) openImportLink(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openImportLink(intent);
    }

    private void openImportLink(Intent intent) {
        Uri data = intent.getData();
        if (data != null && "memep3".equals(data.getScheme()) && "importar".equals(data.getHost())) chooseFile();
    }

    private void chooseFile() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.setType("*/*");
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(picker, CHOOSE_PACK);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == ENABLE_PACK) {
            String error = data == null ? null : data.getStringExtra("validation_error");
            if (error != null && !error.isEmpty()) status.setText(error);
            else if (result == RESULT_OK) status.setText(R.string.pack_added);
            return;
        }
        if (request != CHOOSE_PACK || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        status.setText(R.string.importing);
        importButton.setEnabled(false);
        worker.execute(() -> {
            try {
                PackStore.Pack pack = PackStore.importFile(this, uri);
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    importButton.setEnabled(true);
                    status.setText(R.string.pack_ready);
                    renderPacks(PackStore.list(this), pack.id());
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    importButton.setEnabled(true);
                    status.setText(error instanceof PackStore.CapacityException
                        ? R.string.capacity
                        : R.string.invalid_pack);
                });
            }
        });
    }

    private void showPacks() {
        worker.execute(() -> {
            List<PackStore.Pack> saved = PackStore.list(this);
            runOnUiThread(() -> { if (!isDestroyed()) renderPacks(saved, null); });
        });
    }

    private void renderPacks(List<PackStore.Pack> saved, String importedId) {
        packs.removeAllViews();
        for (PackStore.Pack pack : saved) {
            TextView name = new TextView(this);
            name.setText(getString(R.string.pack_title, pack.name(), pack.count()));
            name.setOnLongClickListener(view -> {
                new AlertDialog.Builder(this).setTitle(R.string.confirm_remove)
                    .setMessage(R.string.remove_details)
                    .setNegativeButton(R.string.cancel, null)
                    .setPositiveButton(R.string.remove, (dialog, which) -> removePack(pack)).show();
                return true;
            });
            packs.addView(name);
            Button add = new Button(this);
            add.setText(R.string.add_to_whatsapp);
            add.setContentDescription(getString(R.string.add_pack_to_whatsapp, pack.name()));
            add.setOnClickListener(view -> openWhatsApp(pack));
            packs.addView(add);
            if (pack.id().equals(importedId)) add.requestFocus();
        }
    }

    private void removePack(PackStore.Pack pack) {
        worker.execute(() -> {
            try {
                PackStore.remove(this, pack);
                List<PackStore.Pack> saved = PackStore.list(this);
                runOnUiThread(() -> {
                    if (isDestroyed()) return;
                    renderPacks(saved, null);
                    status.setText(R.string.pack_removed);
                });
            } catch (IOException error) {
                runOnUiThread(() -> { if (!isDestroyed()) status.setText(R.string.remove_error); });
            }
        });
    }

    private void openWhatsApp(PackStore.Pack pack) {
        List<Intent> targets = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        for (String app : new String[] {"com.whatsapp", "com.whatsapp.w4b"}) {
            Intent intent = new Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK")
                .setPackage(app)
                .putExtra("sticker_pack_id", pack.id())
                .putExtra("sticker_pack_authority", getPackageName() + ".stickers")
                .putExtra("sticker_pack_name", pack.name());
            if (intent.resolveActivity(getPackageManager()) != null) {
                targets.add(intent);
                labels.add("com.whatsapp".equals(app) ? "WhatsApp" : "WhatsApp Business");
            }
        }
        if (targets.isEmpty()) {
            status.setText(R.string.whatsapp_missing);
        } else if (targets.size() == 1) {
            launch(targets.get(0));
        } else {
            new AlertDialog.Builder(this).setTitle(R.string.choose_whatsapp)
                .setItems(labels.toArray(new String[0]), (dialog, which) -> launch(targets.get(which))).show();
        }
    }

    private void launch(Intent intent) {
        try {
            status.setText("");
            startActivityForResult(intent, ENABLE_PACK);
        } catch (ActivityNotFoundException error) {
            status.setText(R.string.whatsapp_open_error);
        }
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }
}
