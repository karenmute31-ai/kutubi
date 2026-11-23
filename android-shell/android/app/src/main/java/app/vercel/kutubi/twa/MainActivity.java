package app.vercel.kutubi.twa;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(ReadingRotationPlugin.class);
        super.onCreate(state);
        setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
        // Keep the whole WebView outside system bars, cutouts and the keyboard.
        // Do not rely on CSS safe-area support in the installed WebView version.
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
        bridge.addWebViewListener(new com.getcapacitor.WebViewListener() {
            @Override public void onPageLoaded(android.webkit.WebView view) {
                try (java.io.InputStream stream=getAssets().open("reader-rotation.js")) {
                    String script=new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
                    view.evaluateJavascript(script,null);
                } catch (java.io.IOException ignored) {}
            }
        });
    }
}
