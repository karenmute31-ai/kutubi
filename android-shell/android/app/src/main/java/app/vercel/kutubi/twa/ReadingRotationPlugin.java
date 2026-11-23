package app.vercel.kutubi.twa;
import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="ReadingRotation")
public class ReadingRotationPlugin extends Plugin {
 @PluginMethod public void setMode(PluginCall call) {
  String mode=call.getString("mode","auto");
  int target;
  switch(mode){case "portrait":target=ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;break;case "landscape":target=ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;break;case "current":target=ActivityInfo.SCREEN_ORIENTATION_LOCKED;break;default:target=ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR;}
  final int orientation=target;
  getActivity().runOnUiThread(()->{getActivity().setRequestedOrientation(orientation);call.resolve();});
 }
}
