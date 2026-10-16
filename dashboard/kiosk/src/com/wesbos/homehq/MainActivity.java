package com.wesbos.homehq;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.JavascriptInterface;
import android.media.AudioManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.provider.Settings;

/**
 * Full-screen kiosk WebView for the Home HQ wall tablet.
 * - Immersive mode hides the status + navigation bars (true 1280x800).
 * - Exit: hold two fingers still on the screen for 1.5s to go to the regular launcher.
 * - Remote debugging is OFF unless launched with the debug extra (every app on this device
 *   gets root, so the devtools socket should only exist while actively debugging):
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
 * - Launch with a URL: adb shell am start -a android.intent.action.VIEW -d <url> -n com.wesbos.homehq/.MainActivity
 */
public class MainActivity extends Activity {
  static final String TAG = "HomeHQ";
  // The frame's trust store has no ISRG Root X1, so the kiosk must load the
  // dashboard over plain HTTP on the LAN. It must not call external HTTPS.
  // build.sh replaces this placeholder from gitignored local.properties
  // (dashboard.url=http://host:4173). The server binds 0.0.0.0:4173.
  static final String DEFAULT_URL = "http://DASHBOARD_HOST:4173";
  static final long EXIT_HOLD_MS = 1500;
  static final float EXIT_SLOP_PX = 60;

  private WebView web;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;
  /** FrameBridge only answers while the dashboard origin is loaded. */
  private volatile boolean trusted;

  private boolean isDashboard(String url) {
    if (url == null) return false;
    android.net.Uri a = android.net.Uri.parse(url);
    android.net.Uri b = android.net.Uri.parse(DEFAULT_URL);
    return "http".equals(a.getScheme()) && a.getHost() != null && a.getHost().equals(b.getHost()) && a.getPort() == b.getPort();
  }

  /**
   * window.FrameBridge for the dashboard's Settings page.
   * Brightness = this window's backlight (no permission). Wi-Fi info needs
   * ACCESS_WIFI_STATE. Reboot uses root (the frame is rooted).
   */
  final class FrameBridge {
    @JavascriptInterface public String version() { return trusted ? "1" : null; }

    @JavascriptInterface public boolean setBrightness(final float level) {
      if (!trusted) return false;
      handler.post(new Runnable() {
        @Override public void run() {
          WindowManager.LayoutParams lp = getWindow().getAttributes();
          lp.screenBrightness = Math.max(0.05f, Math.min(1f, level));
          getWindow().setAttributes(lp);
        }
      });
      return true;
    }

    @JavascriptInterface public String getWifi() {
      if (!trusted) return null;
      try {
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        WifiInfo wi = wm.getConnectionInfo();
        String ssid = wi.getSSID() == null ? "" : wi.getSSID().replace("\"", "");
        int level = WifiManager.calculateSignalLevel(wi.getRssi(), 5);
        return "{\"enabled\":" + wm.isWifiEnabled() + ",\"ssid\":\"" + ssid.replace("\\", "").replace("\"", "") +
            "\",\"rssi\":" + wi.getRssi() + ",\"level\":" + level + "}";
      } catch (Exception e) { return null; }
    }

    @JavascriptInterface public void openWifiSettings() {
      if (!trusted) return;
      Intent i = new Intent(Settings.ACTION_WIFI_SETTINGS);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(i);
    }

    @JavascriptInterface public int getVolume() {
      if (!trusted) return -1;
      AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
      int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
      return max > 0 ? Math.round(100f * am.getStreamVolume(AudioManager.STREAM_MUSIC) / max) : 0;
    }

    @JavascriptInterface public void setVolume(int pct) {
      if (!trusted) return;
      AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
      int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
      am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(max * Math.max(0, Math.min(100, pct)) / 100f), 0);
    }

    @JavascriptInterface public void reboot() {
      if (!trusted) return;
      try { Runtime.getRuntime().exec(new String[] {"su", "-c", "reboot"}); } catch (Exception e) { Log.w(TAG, "reboot failed", e); }
    }
  }

  private final Runnable exitToLauncher = new Runnable() {
    @Override
    public void run() {
      exitArmed = false;
      Log.i(TAG, "Two-finger hold: exiting to launcher");
      Intent home = new Intent(Intent.ACTION_MAIN);
      home.addCategory(Intent.CATEGORY_HOME);
      home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      // When this kiosk is itself the default HOME app, a plain HOME intent would just
      // reopen it, so target the first other launcher (e.g. Rootless) explicitly.
      for (android.content.pm.ResolveInfo ri : getPackageManager().queryIntentActivities(home, 0)) {
        if (ri.activityInfo != null && !getPackageName().equals(ri.activityInfo.packageName)) {
          home.setClassName(ri.activityInfo.packageName, ri.activityInfo.name);
          break;
        }
      }
      startActivity(home);
      finish();
    }
  };

  private final Runnable retryLoad = new Runnable() {
    @Override
    public void run() {
      String u = web.getUrl();
      web.loadUrl(u != null && !u.startsWith("data:") && !u.startsWith("about:") ? u : DEFAULT_URL);
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyDebugFlag(getIntent());
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN
        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setOffscreenPreRaster(true);
    // Overscroll glow and fading scrollbars add draws on this WebView 106 frame.
    // Leave the default layer type: a hardware layer was measured and made scrolling worse.
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.setVerticalScrollBarEnabled(false);
    web.setHorizontalScrollBarEnabled(false);
    web.setScrollbarFadingEnabled(false);
    // Keep navigation inside the kiosk. If the main page fails (e.g. Wi-Fi not up yet
    // right after boot, or the MacBook briefly away), retry every 10s instead of
    // leaving an error page on the wall.
    web.addJavascriptInterface(new FrameBridge(), "FrameBridge");
    web.setWebViewClient(new WebViewClient() {
      @Override
      public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
        trusted = isDashboard(url);
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
        if (req != null && req.isForMainFrame()) {
          Log.w(TAG, "Main frame load failed: " + err.getDescription() + "; retrying in 10s");
          handler.removeCallbacks(retryLoad);
          handler.postDelayed(retryLoad, 10000);
        }
      }
    });
    setContentView(web);

    String url = getIntent().getDataString();
    web.loadUrl(url != null ? url : DEFAULT_URL);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    applyDebugFlag(intent);
    String url = intent.getDataString();
    if (url != null) web.loadUrl(url);
  }

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Watches for the two-finger exit hold; all touches still go to the page. */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            exitIds[i] = e.getPointerId(i);
            exitX[i] = e.getX(i);
            exitY[i] = e.getY(i);
          }
          exitArmed = true;
          handler.removeCallbacks(exitToLauncher);
          handler.postDelayed(exitToLauncher, EXIT_HOLD_MS);
        } else {
          cancelExit(); // 3+ fingers
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (exitArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(exitIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - exitX[i], e.getY(idx) - exitY[i]) > EXIT_SLOP_PX) {
              cancelExit();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelExit();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelExit() {
    if (!exitArmed) return;
    exitArmed = false;
    handler.removeCallbacks(exitToLauncher);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }
}
