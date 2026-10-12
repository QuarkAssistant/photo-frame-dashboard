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
  // dashboard over plain HTTP from the Mac mini on the LAN. It must not call
  // external HTTPS. Replace MAC_MINI_IP with that machine's address — the
  // server from `npm run serve` binds 0.0.0.0:4173.
  static final String DEFAULT_URL = "http://10.0.0.28:4173";
  static final long EXIT_HOLD_MS = 1500;
  static final float EXIT_SLOP_PX = 60;

  private WebView web;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;

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
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    // Keep navigation inside the kiosk. If the main page fails (e.g. Wi-Fi not up yet
    // right after boot, or the MacBook briefly away), retry every 10s instead of
    // leaving an error page on the wall.
    web.setWebViewClient(new WebViewClient() {
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
